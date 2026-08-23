import { describe, expect, it } from 'vitest';
import { tallyRanking, tallyQuestion, tallyOptions } from '../utils/tally';
import { scoreAnswer, normalizeQuestionInput } from '../utils/questionTypes';

const question = { id: 'q', type: 'RANKING', text: 'Order these', options: ['A', 'B', 'C'] };

const response = (rankedOptions: number[]) => ({
  selectedOption: rankedOptions[0] ?? 0,
  selectedOptions: rankedOptions,
  answerText: null,
  rankedOptions,
});

describe('ranking tally', () => {
  it('averages placement across everyone who ranked', () => {
    // A: positions 1 and 3 → 2.0 | B: 2 and 1 → 1.5 | C: 3 and 2 → 2.5
    const result = tallyRanking(question, [response([0, 1, 2]), response([1, 2, 0])]);

    expect(result.map((r) => r.option)).toEqual(['B', 'A', 'C']);
    expect(result[0]).toMatchObject({ option: 'B', averageRank: 1.5, votes: 2 });
    expect(result[1]).toMatchObject({ option: 'A', averageRank: 2, votes: 2 });
  });

  it('sorts best-first, lower average being better', () => {
    const result = tallyRanking(question, [response([2, 0, 1])]);
    expect(result[0]!.option).toBe('C');
  });

  it('puts options nobody ranked last rather than first', () => {
    // A zero average would sort first on a naive ascending sort.
    const result = tallyRanking(question, [{ ...response([0, 1]), rankedOptions: [0, 1] }]);
    const unranked = result[result.length - 1]!;
    expect(unranked.option).toBe('C');
    expect(unranked.votes).toBe(0);
  });

  it('ignores a repeated option within one submission', () => {
    const result = tallyRanking(question, [{ ...response([0]), rankedOptions: [0, 0, 1] }]);
    expect(result.find((r) => r.option === 'A')!.votes).toBe(1);
  });

  it('ignores out-of-range indices', () => {
    const result = tallyRanking(question, [{ ...response([0]), rankedOptions: [0, 99, -1] }]);
    expect(result.find((r) => r.option === 'A')!.votes).toBe(1);
    expect(result.filter((r) => r.votes > 0)).toHaveLength(1);
  });

  it('reports no votes when nobody has answered', () => {
    expect(tallyRanking(question, []).every((r) => r.votes === 0)).toBe(true);
  });
});

describe('ranking does not pollute option counts', () => {
  it('is excluded from single-choice tallying', () => {
    // selectedOption is populated for compatibility, and would otherwise be
    // counted as a vote — the same defect that made text answers look like
    // votes for option A.
    const result = tallyOptions(question, [response([2, 0, 1]), response([2, 1, 0])]);
    expect(result.optionCounts).toEqual([0, 0, 0]);
  });

  it('is carried on the tally as its own field', () => {
    const tally = tallyQuestion(question, [response([1, 0, 2])]);
    expect(tally.ranking).toHaveLength(3);
    expect(tally.optionCounts).toEqual([0, 0, 0]);
  });
});

describe('ranking scoring', () => {
  const q = { type: 'RANKING' as const, correctOption: null, correctOptions: [1, 0, 2] };

  it('marks an exact order correct', () => {
    expect(scoreAnswer(q, 1, [1, 0, 2])).toEqual({ isCorrect: true, score: 1 });
  });

  it('marks a different order incorrect — order is the answer', () => {
    expect(scoreAnswer(q, 0, [0, 1, 2])).toEqual({ isCorrect: false, score: 0 });
  });

  it('scores nothing when no correct order was set', () => {
    expect(scoreAnswer({ type: 'RANKING', correctOption: null, correctOptions: [] }, 0, [0, 1])).toEqual({
      isCorrect: false,
      score: 0,
    });
  });
});

describe('ranking question authoring', () => {
  it('accepts RANKING as a question type', () => {
    const parsed = normalizeQuestionInput({ type: 'RANKING', text: 'Order', options: ['A', 'B', 'C'] });
    expect('value' in parsed && parsed.value.type).toBe('RANKING');
  });

  it('still requires at least two options', () => {
    const parsed = normalizeQuestionInput({ type: 'RANKING', text: 'Order', options: ['A'] });
    expect('error' in parsed).toBe(true);
  });
});
