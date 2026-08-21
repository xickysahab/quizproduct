export type QuestionType = 'MCQ' | 'MULTI_SELECT' | 'OPEN_TEXT' | 'WORD_CLOUD' | 'RATING';

const QUESTION_TYPES: QuestionType[] = ['MCQ', 'MULTI_SELECT', 'OPEN_TEXT', 'WORD_CLOUD', 'RATING'];

export interface NormalizedQuestion {
  type: QuestionType;
  text: string;
  options: string[];
  correctOption: number | null;
  correctOptions: number[];
  timeLimit: number | null;
}

const asType = (value: unknown): QuestionType =>
  typeof value === 'string' && QUESTION_TYPES.includes(value as QuestionType)
    ? (value as QuestionType)
    : 'MCQ';

const cleanOptions = (options: unknown): string[] =>
  Array.isArray(options) ? options.map((opt) => String(opt ?? '').trim()).filter(Boolean) : [];

/**
 * Existing MCQ clients omit `type`. Anything unknown falls back to MCQ so a
 * stale dashboard cannot create a question the live room cannot render.
 */
export const normalizeQuestionInput = (
  body: Record<string, unknown>
): { error: string } | { value: NormalizedQuestion } => {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return { error: 'Question text is required.' };

  const type = asType(body.type);
  const timeLimit =
    body.timeLimit === undefined || body.timeLimit === null || body.timeLimit === 0
      ? null
      : Number(body.timeLimit);

  if (type === 'OPEN_TEXT' || type === 'WORD_CLOUD') {
    return {
      value: {
        type,
        text,
        options: [],
        correctOption: null,
        correctOptions: [],
        timeLimit: Number.isFinite(timeLimit) ? timeLimit : null,
      },
    };
  }

  const options =
    type === 'RATING'
      ? cleanOptions(body.options).length
        ? cleanOptions(body.options)
        : ['1', '2', '3', '4', '5']
      : cleanOptions(body.options);

  if (options.length < 2) {
    return { error: 'At least two options are required for this question type.' };
  }

  const correctOption =
    body.correctOption === undefined || body.correctOption === null || body.correctOption === ''
      ? null
      : Number(body.correctOption);

  const correctOptions = Array.isArray(body.correctOptions)
    ? body.correctOptions.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < options.length)
    : correctOption !== null && Number.isInteger(correctOption)
      ? [correctOption]
      : [];

  if (correctOption !== null && (!Number.isInteger(correctOption) || correctOption < 0 || correctOption >= options.length)) {
    return { error: 'Correct option is out of range.' };
  }

  return {
    value: {
      type,
      text,
      options,
      correctOption: Number.isInteger(correctOption) ? correctOption : null,
      correctOptions,
      timeLimit: Number.isFinite(timeLimit) ? timeLimit : null,
    },
  };
};

export const scoreAnswer = (
  question: {
    type: QuestionType | string;
    correctOption: number | null;
    correctOptions?: number[];
  },
  selectedOption: number,
  selectedOptions: number[]
): { isCorrect: boolean; score: number } => {
  if (question.type === 'MCQ' || question.type === 'RATING') {
    const isCorrect = question.correctOption !== null && question.correctOption === selectedOption;
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  if (question.type === 'MULTI_SELECT') {
    const expected = [...(question.correctOptions || [])].sort((a, b) => a - b);
    const got = [...selectedOptions].sort((a, b) => a - b);
    const isCorrect = expected.length > 0 && expected.join(',') === got.join(',');
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  return { isCorrect: false, score: 0 };
};
