import { normalizeQuestionInput, NormalizedQuestion } from './questionTypes';

/**
 * One spreadsheet row, as the import template lays it out. The browser reads
 * the file and sends these fields untouched; every rule lives here, so the
 * preview and the save can never disagree about what a valid row is.
 */
export interface ImportRow {
  type?: unknown;
  question?: unknown;
  options?: unknown;
  /** 1-based, as a teacher writes it: "2", or "1, 3" for several. */
  correct?: unknown;
  timeLimit?: unknown;
}

export const MAX_IMPORT_ROWS = 500;

const TYPE_ALIASES: Record<string, string> = {
  mcq: 'MCQ',
  'multiple choice': 'MCQ',
  multi_select: 'MULTI_SELECT',
  'multi-select': 'MULTI_SELECT',
  'multi select': 'MULTI_SELECT',
  open_text: 'OPEN_TEXT',
  'open text': 'OPEN_TEXT',
  word_cloud: 'WORD_CLOUD',
  'word cloud': 'WORD_CLOUD',
  rating: 'RATING',
  ranking: 'RANKING',
};

const text = (value: unknown): string => (value === undefined || value === null ? '' : String(value).trim());

export const rowToQuestion = (row: ImportRow): { value: NormalizedQuestion } | { error: string } => {
  const rawType = text(row.type).toLowerCase();
  const type = rawType ? TYPE_ALIASES[rawType] : 'MCQ';
  if (!type) return { error: `Unknown type "${text(row.type)}".` };

  const options = (Array.isArray(row.options) ? row.options : []).map(text).filter(Boolean);

  const correctText = text(row.correct);
  const correct = correctText ? correctText.split(/[,;\s]+/).filter(Boolean).map(Number) : [];
  if (correct.some((n) => !Number.isInteger(n) || n < 1 || n > options.length)) {
    return { error: `Correct answer "${correctText}" must be option numbers between 1 and ${options.length}.` };
  }
  const indices = correct.map((n) => n - 1);

  if (type === 'MCQ' && indices.length > 1) {
    return { error: 'A multiple-choice question has one correct answer; use MULTI_SELECT for several.' };
  }
  if (type === 'MULTI_SELECT' && indices.length === 1) {
    return { error: 'A multi-select question needs two or more correct answers.' };
  }

  return normalizeQuestionInput({
    type,
    text: text(row.question),
    options,
    correctOption: type === 'MCQ' || type === 'RATING' ? indices[0] ?? null : null,
    correctOptions: type === 'MULTI_SELECT' || type === 'RANKING' ? indices : undefined,
    timeLimit: text(row.timeLimit) || undefined,
  });
};

/** Every row checked; either all of them are good, or the bad ones by row number. */
export const parseImport = (
  rows: ImportRow[]
): { questions: NormalizedQuestion[] } | { errors: { row: number; message: string }[] } => {
  const questions: NormalizedQuestion[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((row, index) => {
    const result = rowToQuestion(row);
    // Row 1 of the sheet is the header, so the first data row is row 2.
    if ('error' in result) errors.push({ row: index + 2, message: result.error });
    else questions.push(result.value);
  });

  return errors.length ? { errors } : { questions };
};
