/**
 * Response tallying for the results screens.
 *
 * Kept out of the controller and free of Prisma so the counting rules — which
 * differ per question type and were previously wrong in three separate ways —
 * can be tested directly.
 */

export interface TallyQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
}

export interface TallyResponse {
  selectedOption: number;
  selectedOptions: number[];
  answerText: string | null;
  rankedOptions?: number[];
}

/** Mean placement of one option in a ranking question. Lower is better. */
export interface RankAverage {
  option: string;
  index: number;
  /** 1-based mean position across everyone who ranked it. */
  averageRank: number;
  votes: number;
}

export interface WordCount {
  word: string;
  count: number;
}

export interface QuestionTally {
  id: string;
  text: string;
  type: string;
  options: string[];
  /** Number of participants who answered — not number of options picked. */
  totalResponses: number;
  optionCounts: number[];
  percentages: number[];
  textAnswers: string[];
  words: WordCount[];
  /** Populated for RANKING only, ordered best-first. */
  ranking: RankAverage[];
}

/** Question types that collect free text instead of an option index. */
const isTextType = (type: string): boolean =>
  type === 'OPEN_TEXT' || type === 'WORD_CLOUD';

/**
 * Counts option selections for one question.
 *
 * Three rules that were previously broken:
 *  - text answers never contribute to option counts. `selectedOption` defaults
 *    to 0 in the database, so counting it blindly registered every free-text
 *    submission as a vote for option A.
 *  - multi-select counts every index the participant chose, not just the first.
 *  - percentages are share-of-respondents, so a multi-select question can
 *    legitimately total more than 100%.
 */
export const tallyOptions = (
  question: TallyQuestion,
  responses: TallyResponse[]
): { totalResponses: number; optionCounts: number[]; percentages: number[] } => {
  const optionCounts = new Array<number>(question.options.length).fill(0);

  // Text and ranking questions carry no single-option choice. Counting one
  // would read `selectedOption`, which defaults to 0 — the same defect that
  // made every free-text answer look like a vote for option A.
  if (isTextType(question.type) || question.type === 'RANKING') {
    return { totalResponses: responses.length, optionCounts, percentages: optionCounts.slice() };
  }

  const inRange = (index: number): boolean =>
    Number.isInteger(index) && index >= 0 && index < optionCounts.length;

  for (const response of responses) {
    if (question.type === 'MULTI_SELECT') {
      // De-duplicate so a malformed payload cannot double-count one participant.
      const chosen = new Set(response.selectedOptions.filter(inRange));
      chosen.forEach((index) => {
        optionCounts[index] = (optionCounts[index] ?? 0) + 1;
      });
      continue;
    }

    if (inRange(response.selectedOption)) {
      optionCounts[response.selectedOption] = (optionCounts[response.selectedOption] ?? 0) + 1;
    }
  }

  const totalResponses = responses.length;
  const percentages = optionCounts.map((count) =>
    totalResponses === 0 ? 0 : Math.round((count / totalResponses) * 100)
  );

  return { totalResponses, optionCounts, percentages };
};

const WORD_SPLIT = /[\s,.;:!?/|]+/;

/**
 * Frequency-counts short text answers for the word cloud.
 *
 * Answers are lowercased for grouping but reported using the most common
 * original casing, so "Mumbai" does not display as "mumbai".
 */
export const tallyWords = (answers: string[], limit = 60): WordCount[] => {
  const counts = new Map<string, { count: number; forms: Map<string, number> }>();

  for (const answer of answers) {
    if (!answer) continue;

    // A short phrase stays whole; a sentence is split into words.
    const trimmed = answer.trim();
    const parts = trimmed.split(WORD_SPLIT).filter(Boolean);
    const tokens = parts.length > 0 && parts.length <= 3 ? [trimmed] : parts;

    for (const rawToken of tokens) {
      const token = rawToken.trim();
      if (!token) continue;

      const key = token.toLowerCase();
      const entry = counts.get(key) ?? { count: 0, forms: new Map<string, number>() };
      entry.count += 1;
      entry.forms.set(token, (entry.forms.get(token) ?? 0) + 1);
      counts.set(key, entry);
    }
  }

  return Array.from(counts.entries())
    .map(([key, entry]) => {
      let word = key;
      let best = 0;
      entry.forms.forEach((n, form) => {
        if (n > best) {
          best = n;
          word = form;
        }
      });
      return { word, count: entry.count };
    })
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
};

/**
 * Mean placement per option for a ranking question.
 *
 * Counting a ranking as if it were a single choice would throw away everything
 * except each person's first pick, which is the same mistake multi-select used
 * to make. Options nobody ranked are reported with zero votes rather than
 * silently dropped.
 */
export const tallyRanking = (
  question: TallyQuestion,
  responses: TallyResponse[]
): RankAverage[] => {
  const totals = question.options.map(() => ({ sum: 0, votes: 0 }));

  for (const response of responses) {
    const order = response.rankedOptions ?? [];
    const seen = new Set<number>();

    order.forEach((optionIndex, position) => {
      if (
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= totals.length ||
        seen.has(optionIndex)
      ) {
        return;
      }
      seen.add(optionIndex);
      const entry = totals[optionIndex]!;
      entry.sum += position + 1;
      entry.votes += 1;
    });
  }

  return question.options
    .map((option, index) => {
      const entry = totals[index]!;
      return {
        option,
        index,
        averageRank: entry.votes === 0 ? 0 : Number((entry.sum / entry.votes).toFixed(2)),
        votes: entry.votes,
      };
    })
    // Unranked options sort last rather than first, which a raw ascending
    // sort on a zero average would do.
    .sort((a, b) => {
      if (a.votes === 0 && b.votes === 0) return a.index - b.index;
      if (a.votes === 0) return 1;
      if (b.votes === 0) return -1;
      return a.averageRank - b.averageRank;
    });
};

/** Full per-question tally, including text aggregation. */
export const tallyQuestion = (
  question: TallyQuestion,
  responses: TallyResponse[]
): QuestionTally => {
  const { totalResponses, optionCounts, percentages } = tallyOptions(question, responses);

  const textAnswers = isTextType(question.type)
    ? responses
        .map((response) => response.answerText)
        .filter((value): value is string => Boolean(value && value.trim()))
    : [];

  return {
    id: question.id,
    text: question.text,
    type: question.type,
    options: question.options,
    totalResponses,
    optionCounts,
    percentages,
    textAnswers,
    words: question.type === 'WORD_CLOUD' ? tallyWords(textAnswers) : [],
    ranking: question.type === 'RANKING' ? tallyRanking(question, responses) : [],
  };
};

/**
 * A cross-question average only means something when every question offers the
 * same choices — a survey on one shared scale. Averaging "Mumbai/Pune/Nagpur"
 * against "Yes/No" produces a number with no referent, which is what the old
 * hardcoded four-slot aggregate did.
 *
 * Returns null when the questions do not share a scale, and the caller renders
 * per-question results instead.
 */
export const collectiveTally = (
  tallies: QuestionTally[]
): { options: string[]; optionCounts: number[]; percentages: number[]; totalResponses: number } | null => {
  const scored = tallies.filter(
    (tally) => !isTextType(tally.type) && tally.type !== 'RANKING' && tally.options.length > 0
  );
  if (scored.length === 0) return null;

  const shape = JSON.stringify(scored[0]!.options);
  const sharesScale = scored.every((tally) => JSON.stringify(tally.options) === shape);
  if (!sharesScale) return null;

  const width = scored[0]!.options.length;
  const optionCounts = new Array<number>(width).fill(0);
  let totalResponses = 0;

  for (const tally of scored) {
    tally.optionCounts.forEach((count, index) => {
      optionCounts[index] = (optionCounts[index] ?? 0) + count;
    });
    totalResponses += tally.totalResponses;
  }

  // Computed from pooled counts, not by averaging percentages and then forcing
  // the result to sum to 100 — which systematically inflated the largest option.
  const totalSelections = optionCounts.reduce((sum, count) => sum + count, 0);
  const percentages = optionCounts.map((count) =>
    totalSelections === 0 ? 0 : Math.round((count / totalSelections) * 100)
  );

  return { options: scored[0]!.options, optionCounts, percentages, totalResponses };
};
