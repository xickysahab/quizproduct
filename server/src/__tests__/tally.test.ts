import { describe, expect, it } from 'vitest';
import { collectiveTally, tallyOptions, tallyQuestion, tallyWords } from '../utils/tally';
import { normalizeQuestionInput } from '../utils/questionTypes';

const response = (over: Partial<{ selectedOption: number; selectedOptions: number[]; answerText: string | null }> = {}) => ({
  selectedOption: 0,
  selectedOptions: [],
  answerText: null,
  ...over,
});

describe('option tallying (BUG-07)', () => {
  it('does not count text answers as a vote for option A', () => {
    // selectedOption defaults to 0 in the database and text answers never
    // overwrite it, so a naive tally scored every comment as option A.
    const question = { id: 'q', type: 'OPEN_TEXT', text: 'Thoughts?', options: [] };
    const result = tallyOptions(question, [
      response({ answerText: 'great session' }),
      response({ answerText: 'too fast' }),
    ]);

    expect(result.optionCounts).toEqual([]);
    expect(result.totalResponses).toBe(2);
  });

  it('keeps a word-cloud question out of the option counts too', () => {
    const question = { id: 'q', type: 'WORD_CLOUD', text: 'One word?', options: [] };
    const result = tallyOptions(question, [response({ answerText: 'Mumbai' })]);
    expect(result.optionCounts).toEqual([]);
  });
});

describe('multi-select tallying (BUG-08)', () => {
  const question = { id: 'q', type: 'MULTI_SELECT', text: 'Pick all', options: ['A', 'B', 'C'] };

  it('counts every option a participant selected, not just the first', () => {
    const result = tallyOptions(question, [response({ selectedOption: 0, selectedOptions: [0, 1, 2] })]);
    expect(result.optionCounts).toEqual([1, 1, 1]);
  });

  it('percentages may exceed 100 because they are share-of-respondents', () => {
    const result = tallyOptions(question, [
      response({ selectedOption: 0, selectedOptions: [0, 1] }),
      response({ selectedOption: 1, selectedOptions: [1, 2] }),
    ]);

    expect(result.optionCounts).toEqual([1, 2, 1]);
    expect(result.percentages).toEqual([50, 100, 50]);
  });

  it('does not double-count a repeated index from a malformed payload', () => {
    const result = tallyOptions(question, [response({ selectedOption: 0, selectedOptions: [1, 1, 1] })]);
    expect(result.optionCounts).toEqual([0, 1, 0]);
  });

  it('ignores out-of-range indices', () => {
    const result = tallyOptions(question, [response({ selectedOption: 0, selectedOptions: [0, 99, -3] })]);
    expect(result.optionCounts).toEqual([1, 0, 0]);
  });
});

describe('single-choice tallying', () => {
  it('counts the selected option', () => {
    const question = { id: 'q', type: 'MCQ', text: 'Capital?', options: ['Mumbai', 'Pune'] };
    const result = tallyOptions(question, [
      response({ selectedOption: 0 }),
      response({ selectedOption: 0 }),
      response({ selectedOption: 1 }),
    ]);

    expect(result.optionCounts).toEqual([2, 1]);
    expect(result.percentages).toEqual([67, 33]);
  });

  it('reports zeroes rather than dividing by zero with no responses', () => {
    const question = { id: 'q', type: 'MCQ', text: 'Capital?', options: ['Mumbai', 'Pune'] };
    expect(tallyOptions(question, []).percentages).toEqual([0, 0]);
  });
});

describe('collective tallying (BUG-09)', () => {
  const tally = (options: string[], counts: number[], type = 'MCQ') =>
    tallyQuestion(
      { id: Math.random().toString(), type, text: 'q', options },
      counts.flatMap((count, index) =>
        Array.from({ length: count }, () => response({ selectedOption: index }))
      )
    );

  it('returns null when questions do not share a scale', () => {
    // Averaging "Mumbai/Pune" against "Yes/No" has no meaning — this is what
    // the hardcoded four-slot aggregate used to do regardless.
    const result = collectiveTally([
      tally(['Mumbai', 'Pune'], [3, 1]),
      tally(['Yes', 'No', 'Maybe'], [2, 2, 0]),
    ]);

    expect(result).toBeNull();
  });

  it('pools counts when every question uses the same scale', () => {
    const scale = ['Strongly agree', 'Agree', 'Disagree'];
    const result = collectiveTally([tally(scale, [2, 1, 1]), tally(scale, [2, 3, 1])]);

    expect(result).not.toBeNull();
    expect(result!.optionCounts).toEqual([4, 4, 2]);
    expect(result!.options).toEqual(scale);
  });

  it('does not pad the largest option to force a sum of 100', () => {
    // The old code averaged percentages then dumped the rounding remainder on
    // the biggest bucket, systematically overstating it.
    const result = collectiveTally([tally(['A', 'B', 'C'], [1, 1, 1])]);
    expect(result!.percentages).toEqual([33, 33, 33]);
    expect(result!.percentages.reduce((a, b) => a + b, 0)).toBe(99);
  });

  it('ignores text questions when deciding whether a scale is shared', () => {
    const scale = ['Yes', 'No'];
    const result = collectiveTally([
      tally(scale, [1, 1]),
      tallyQuestion({ id: 't', type: 'OPEN_TEXT', text: 'Why?', options: [] }, [
        response({ answerText: 'because' }),
      ]),
    ]);

    expect(result).not.toBeNull();
    expect(result!.options).toEqual(scale);
  });
});

describe('word cloud aggregation', () => {
  it('groups case-insensitively but reports the most common casing', () => {
    const words = tallyWords(['Mumbai', 'mumbai', 'Mumbai', 'Pune']);
    expect(words[0]).toEqual({ word: 'Mumbai', count: 3 });
    expect(words[1]).toEqual({ word: 'Pune', count: 1 });
  });

  it('keeps a short phrase whole instead of splitting it into words', () => {
    const words = tallyWords(['machine learning', 'machine learning']);
    expect(words[0]).toEqual({ word: 'machine learning', count: 2 });
  });

  it('splits a long answer into individual words', () => {
    const words = tallyWords(['the quick brown fox jumps over things']);
    expect(words.some((entry) => entry.word === 'quick')).toBe(true);
  });

  it('ignores blank answers', () => {
    expect(tallyWords(['', '   '])).toEqual([]);
  });
});

describe('time limit clamping (BUG-10)', () => {
  const parse = (timeLimit: unknown) =>
    normalizeQuestionInput({ text: 'Q', options: ['A', 'B'], timeLimit });

  it('rejects a negative limit rather than storing it', () => {
    // -5 used to pass validation, then poison the answer check: the guard
    // `timeLimit && elapsed > timeLimit + grace` treats -5 as truthy, so every
    // answer was rejected as late from the first millisecond.
    const parsed = parse(-5);
    expect('value' in parsed && parsed.value.timeLimit).toBeNull();
  });

  it('treats zero and empty as no timer', () => {
    expect('value' in parse(0) && parse(0).value.timeLimit).toBeNull();
    expect('value' in parse('') && parse('').value.timeLimit).toBeNull();
  });

  it('raises an unusably small limit to the floor', () => {
    expect('value' in parse(2) && parse(2).value.timeLimit).toBe(5);
  });

  it('caps an absurdly large limit', () => {
    expect('value' in parse(999999) && parse(999999).value.timeLimit).toBe(3600);
  });

  it('passes a sensible limit through unchanged', () => {
    expect('value' in parse(30) && parse(30).value.timeLimit).toBe(30);
  });

  it('ignores a non-numeric limit', () => {
    expect('value' in parse('abc') && parse('abc').value.timeLimit).toBeNull();
  });
});
