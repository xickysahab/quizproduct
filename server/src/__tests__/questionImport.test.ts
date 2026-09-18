import { describe, expect, it } from 'vitest';
import { parseImport, rowToQuestion } from '../utils/questionImport';

const opts = ['Mumbai', 'Pune', 'Nagpur', 'Nashik'];

describe('rowToQuestion', () => {
  it('reads a 1-based answer the way a teacher writes it', () => {
    expect(rowToQuestion({ type: 'mcq', question: 'Capital?', options: opts, correct: '1' })).toMatchObject({
      value: { type: 'MCQ', correctOption: 0 },
    });
  });

  it('defaults a blank type to multiple choice and takes spaced names', () => {
    expect(rowToQuestion({ question: 'Q', options: opts, correct: 2 })).toMatchObject({ value: { type: 'MCQ' } });
    expect(rowToQuestion({ type: 'Multi select', question: 'Q', options: opts, correct: '1, 3' })).toMatchObject({
      value: { type: 'MULTI_SELECT', correctOptions: [0, 2] },
    });
  });

  it('says what is wrong with a bad row', () => {
    expect(rowToQuestion({ type: 'essay', question: 'Q' })).toEqual({ error: 'Unknown type "essay".' });
    expect(rowToQuestion({ question: 'Q', options: opts, correct: '5' })).toMatchObject({ error: expect.stringContaining('between 1 and 4') });
    expect(rowToQuestion({ question: 'Q', options: opts, correct: '1,2' })).toMatchObject({ error: expect.stringContaining('MULTI_SELECT') });
    expect(rowToQuestion({ question: '', options: opts })).toEqual({ error: 'Question text is required.' });
  });

  it('keeps a spreadsheet time limit', () => {
    expect(rowToQuestion({ type: 'open text', question: 'Why?', timeLimit: '45' })).toMatchObject({ value: { timeLimit: 45 } });
  });
});

describe('parseImport', () => {
  it('names every bad row by its sheet row number', () => {
    const result = parseImport([
      { question: 'Good', options: opts, correct: '1' },
      { question: '', options: opts },
      { question: 'Good', options: opts, correct: '9' },
    ]);
    expect(result).toEqual({
      errors: [
        { row: 3, message: 'Question text is required.' },
        { row: 4, message: expect.any(String) },
      ],
    });
  });
});
