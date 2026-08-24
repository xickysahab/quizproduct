export type QuestionType =
  | 'MCQ'
  | 'MULTI_SELECT'
  | 'OPEN_TEXT'
  | 'WORD_CLOUD'
  | 'RATING'
  | 'RANKING';

/** Mean placement of one option in a ranking question. Lower is better. */
export interface RankAverage {
  option: string;
  index: number;
  averageRank: number;
  votes: number;
}

export interface WordCount {
  word: string;
  count: number;
}

/** One question's results, as returned by the analytics endpoints. */
export interface QuestionTally {
  id: string;
  text: string;
  type: QuestionType;
  options: string[];
  totalResponses: number;
  optionCounts: number[];
  percentages: number[];
  textAnswers: string[];
  words: WordCount[];
  /** Populated for RANKING only, ordered best-first. */
  ranking: RankAverage[];
  correctOption?: number | null;
  correctOptions?: number[];
}

/**
 * Pooled results across questions. Null unless every scored question offers the
 * same options — averaging a city question against a yes/no question produces a
 * number with no meaning.
 */
export interface CollectiveTally {
  totalResponses: number;
  optionCounts: number[];
  percentages: number[];
  optionsText: string[];
}

export interface EventSummary {
  eventId: string;
  title: string;
  totalParticipants: number;
  questions: QuestionTally[];
  collective: CollectiveTally | null;
}

export interface LeaderboardRow {
  participantId: string;
  name: string;
  score: number;
  answers: number;
  rank: number;
  lastAnsweredAt: string | null;
}

/** A question as the participant receives it — never carries the answer key. */
export interface LiveQuestion {
  id: string;
  eventId: string;
  type: QuestionType;
  text: string;
  options: string[];
  order: number;
  timeLimit: number | null;
}

/** A question as the host receives it, answer key included. */
export interface HostQuestion extends LiveQuestion {
  correctOption: number | null;
  correctOptions: number[];
}

export interface EventDetail {
  id: string;
  title: string;
  roomCode: string;
  hostId: string;
  isLive: boolean;
  currentQuestionId: string | null;
  currentQuestionStartedAt: string | null;
  concludeConfig: ConcludeConfig | null;
  sessionMode?: 'QUIZ' | 'SURVEY';
  preset?: string;
  scoringEnabled?: boolean;
  streakBonusEnabled?: boolean;
  leaderboardVisibility?: 'HIDDEN' | 'HOST_ONLY' | 'EVERYONE';
  scoreboardBetweenQuestions?: boolean;
  podiumAtEnd?: boolean;
  resultsReveal?: 'HOST_TRIGGERED' | 'AUTO_AFTER_QUESTION' | 'NEVER';
  autoAdvance?: boolean;
  phoneShowsQuestion?: boolean;
  soundEnabled?: boolean;
  qaEnabled?: boolean;
  qaModerated?: boolean;
  questions: HostQuestion[];
  _count?: { participants?: number; questions?: number };
}

export interface ConcludeOption {
  letter: string;
  text: string;
  alert: string;
  themeColor: string;
}

export interface ConcludeConfig {
  chartType: 'CUSTOM_GRID' | 'BAR_CHART' | 'PIE_CHART';
  options: ConcludeOption[];
}
