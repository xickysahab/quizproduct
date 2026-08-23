export type QuestionType = 'MCQ' | 'MULTI_SELECT' | 'OPEN_TEXT' | 'WORD_CLOUD' | 'RATING' | 'RANKING';

const QUESTION_TYPES: QuestionType[] = ['MCQ', 'MULTI_SELECT', 'OPEN_TEXT', 'WORD_CLOUD', 'RATING', 'RANKING'];

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

/** Seconds. Below the floor a question is unanswerable; above the ceiling the timer is meaningless. */
const MIN_TIME_LIMIT = 5;
const MAX_TIME_LIMIT = 3600;

/**
 * Normalizes a time limit to null (no timer) or a usable number of seconds.
 *
 * A negative value used to survive validation and then poison the answer check:
 * `timeLimit && elapsed > timeLimit + grace` treats -5 as truthy, so every
 * answer was rejected as late from the first millisecond.
 */
const cleanTimeLimit = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  return Math.min(Math.max(Math.floor(seconds), MIN_TIME_LIMIT), MAX_TIME_LIMIT);
};

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
  const timeLimit = cleanTimeLimit(body.timeLimit);

  if (type === 'OPEN_TEXT' || type === 'WORD_CLOUD') {
    return {
      value: {
        type,
        text,
        options: [],
        correctOption: null,
        correctOptions: [],
        timeLimit,
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
      timeLimit,
    },
  };
};

export interface ParticipantSafeQuestion {
  id: string;
  eventId: string;
  type: QuestionType | string;
  text: string;
  options: string[];
  order: number;
  timeLimit: number | null;
}

/**
 * Strips the answer key off a question before it is sent to participants.
 *
 * A stored Question carries `correctOption` and `correctOptions`. Broadcasting
 * the row as-is puts the answer in the browser of everyone taking the quiz, so
 * every participant-bound payload must go through this projection — never the
 * Prisma row directly.
 */
export const toParticipantQuestion = (question: {
  id: string;
  eventId: string;
  type: QuestionType | string;
  text: string;
  options: string[];
  order: number;
  timeLimit: number | null;
}): ParticipantSafeQuestion => ({
  id: question.id,
  eventId: question.eventId,
  type: question.type,
  text: question.text,
  options: question.options,
  order: question.order,
  timeLimit: question.timeLimit,
});

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

  if (question.type === 'RANKING') {
    // A ranking is a preference, not an answer — order matters, so only an
    // exact sequence match counts, and only when a correct order was set.
    const expected = question.correctOptions || [];
    const isCorrect = expected.length > 0 && expected.join(',') === selectedOptions.join(',');
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  return { isCorrect: false, score: 0 };
};
