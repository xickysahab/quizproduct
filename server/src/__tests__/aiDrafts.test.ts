import { describe, expect, it } from 'vitest';
import { toQuestion } from '../utils/aiDrafts';

describe('toQuestion', () => {
  it('maps an MCQ answer index onto correctOption', () => {
    const q = toQuestion({ type: 'MCQ', text: 'प्रश्न?', options: ['क', 'ख', 'ग', 'घ'], correct: [2] });
    expect(q).toMatchObject({ type: 'MCQ', correctOption: 2, correctOptions: [2], timeLimit: 30 });
  });

  it('keeps every correct index on a multi-select', () => {
    const q = toQuestion({ type: 'MULTI_SELECT', text: 'Pick two', options: ['a', 'b', 'c', 'd'], correct: [0, 3] });
    expect(q).toMatchObject({ correctOption: null, correctOptions: [0, 3] });
  });

  it('drops a draft the add path would refuse', () => {
    expect(toQuestion({ type: 'MCQ', text: 'x', options: ['a', 'b'], correct: [7] })).toBeNull();
    expect(toQuestion({ type: 'MCQ', text: ' ', options: ['a', 'b'], correct: [0] })).toBeNull();
  });

  it('gives open text no options', () => {
    expect(toQuestion({ type: 'OPEN_TEXT', text: 'Why?', options: ['stray'], correct: [0] })).toMatchObject({
      options: [],
      correctOptions: [],
    });
  });
});
