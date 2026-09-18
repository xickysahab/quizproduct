import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { normalizeQuestionInput, NormalizedQuestion, QuestionType } from './questionTypes';

/**
 * Drafts quiz questions from a chapter PDF.
 *
 * The PDF goes to Claude as a document block — no PDF library to parse it
 * here, and scanned pages work because the model reads the page images too.
 * Drafts are never saved: every one goes through `normalizeQuestionInput`, the
 * same gate a hand-typed question passes, and then back to the host to edit.
 */

/** The eight languages the participant phone already speaks. */
export const DRAFT_LANGUAGES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  mr: 'Marathi (Devanagari script)',
  bn: 'Bengali (Bengali script)',
  ta: 'Tamil (Tamil script)',
  te: 'Telugu (Telugu script)',
  gu: 'Gujarati (Gujarati script)',
  kn: 'Kannada (Kannada script)',
};

export const DRAFT_TYPES: QuestionType[] = ['MCQ', 'MULTI_SELECT', 'OPEN_TEXT'];
export const MAX_DRAFTS = 30;
/** Raw PDF bytes. Well under the API's 32 MB request ceiling once base64-encoded. */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

export class DraftError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: DRAFT_TYPES },
          text: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correct: { type: 'array', items: { type: 'integer' } },
        },
        required: ['type', 'text', 'options', 'correct'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

interface RawDraft {
  type: string;
  text: string;
  options: string[];
  correct: number[];
}

let client: Anthropic | null = null;
const getClient = (): Anthropic => {
  if (!env.anthropicApiKey) {
    throw new DraftError('AI drafts are not switched on for this server.', 503);
  }
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
};

/** Turns one model draft into the shape a saved question has, or drops it. */
export const toQuestion = (raw: RawDraft): NormalizedQuestion | null => {
  const parsed = normalizeQuestionInput({
    type: raw.type,
    text: raw.text,
    options: raw.options,
    correctOption: raw.type === 'MCQ' ? raw.correct[0] ?? null : null,
    correctOptions: raw.type === 'MULTI_SELECT' ? raw.correct : undefined,
    timeLimit: 30,
  });
  return 'error' in parsed ? null : parsed.value;
};

export const draftQuestions = async (input: {
  pdfBase64: string;
  language: string;
  count: number;
  types: QuestionType[];
}): Promise<NormalizedQuestion[]> => {
  const language = DRAFT_LANGUAGES[input.language];

  const prompt = [
    `Write ${input.count} quiz questions a teacher can ask their class about the attached chapter.`,
    `Write every question and every option in ${language}, whatever language the chapter is in.`,
    `Use only these question types: ${input.types.join(', ')}.`,
    'MCQ: exactly four options, one correct; `correct` holds its zero-based index.',
    'MULTI_SELECT: four or five options, two or more correct; `correct` holds every correct index.',
    'OPEN_TEXT: a short-answer prompt; `options` and `correct` are empty.',
    'Cover the whole chapter rather than its first pages, test understanding rather than recall of exact wording, and keep each question answerable from the chapter alone.',
  ].join('\n');

  const stream = getClient().beta.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.BadRequestError) {
      // Almost always the document itself: encrypted, corrupt, or too many pages.
      throw new DraftError('That PDF could not be read. Try a smaller or unlocked file.', 400);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new DraftError('Drafting is busy right now. Try again in a minute.', 503);
    }
    throw error;
  }

  if (message.stop_reason === 'refusal') {
    throw new DraftError('Questions could not be drafted from this document.', 422);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new DraftError('That asked for too much at once. Ask for fewer questions.', 422);
  }

  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  let raw: RawDraft[];
  try {
    raw = (JSON.parse(text) as { questions: RawDraft[] }).questions;
  } catch {
    throw new DraftError('The draft came back malformed. Try again.', 502);
  }

  return raw
    .map(toQuestion)
    .filter((q): q is NormalizedQuestion => q !== null && input.types.includes(q.type))
    .slice(0, input.count);
};
