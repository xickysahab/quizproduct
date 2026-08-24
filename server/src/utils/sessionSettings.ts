/**
 * Session personality: presets, resolution, and the rules that stop a host
 * assembling a combination that cannot work.
 *
 * The design decision this file exists to express: a session's character is
 * NOT an enum. It is a set of independent switches, and a "preset" is only a
 * named bundle that writes several of them at once. That is what makes mixing
 * possible — an enum can say "quiz" or "survey" but never "Q&A running
 * throughout, scoring on, podium off".
 *
 * Kept free of Prisma so every rule here is directly testable.
 */

export type SessionPreset = 'DISCUSSION' | 'GAME' | 'SURVEY' | 'CUSTOM';
export type LeaderboardVisibility = 'HIDDEN' | 'HOST_ONLY' | 'EVERYONE';
export type ResultsReveal = 'HOST_TRIGGERED' | 'AUTO_AFTER_QUESTION' | 'NEVER';
export type ScoredOverride = 'INHERIT' | 'YES' | 'NO';

export interface SessionSwitches {
  scoringEnabled: boolean;
  speedBonusEnabled: boolean;
  streakBonusEnabled: boolean;
  leaderboardVisibility: LeaderboardVisibility;
  scoreboardBetweenQuestions: boolean;
  podiumAtEnd: boolean;
  resultsReveal: ResultsReveal;
  autoAdvance: boolean;
  phoneShowsQuestion: boolean;
  soundEnabled: boolean;
  qaEnabled: boolean;
  qaModerated: boolean;
  allowAnonymous: boolean;
}

export const SWITCH_KEYS = [
  'scoringEnabled',
  'speedBonusEnabled',
  'streakBonusEnabled',
  'leaderboardVisibility',
  'scoreboardBetweenQuestions',
  'podiumAtEnd',
  'resultsReveal',
  'autoAdvance',
  'phoneShowsQuestion',
  'soundEnabled',
  'qaEnabled',
  'qaModerated',
  'allowAnonymous',
] as const satisfies readonly (keyof SessionSwitches)[];

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

/**
 * Named starting points. Deliberately not called after the products they
 * resemble — shipping a competitor's trademark as a UI label is not something
 * to do casually, and these names describe the behaviour anyway.
 */
export const PRESETS: Record<Exclude<SessionPreset, 'CUSTOM'>, SessionSwitches> = {
  /** Meetings and town halls. The audience asks; nobody loses. */
  DISCUSSION: {
    scoringEnabled: false,
    speedBonusEnabled: false,
    streakBonusEnabled: false,
    leaderboardVisibility: 'HIDDEN',
    scoreboardBetweenQuestions: false,
    podiumAtEnd: false,
    resultsReveal: 'HOST_TRIGGERED',
    autoAdvance: false,
    phoneShowsQuestion: true,
    soundEnabled: false,
    qaEnabled: true,
    qaModerated: true,
    allowAnonymous: true,
  },

  /** A race. Speed, streaks, standings between questions, podium at the end. */
  GAME: {
    scoringEnabled: true,
    speedBonusEnabled: true,
    streakBonusEnabled: true,
    leaderboardVisibility: 'EVERYONE',
    scoreboardBetweenQuestions: true,
    podiumAtEnd: true,
    resultsReveal: 'AUTO_AFTER_QUESTION',
    // Left off even here: a host losing control of pacing mid-room is worse
    // than a host pressing Next.
    autoAdvance: false,
    // Phones show only the tiles, so attention goes to the shared screen.
    phoneShowsQuestion: false,
    soundEnabled: true,
    qaEnabled: false,
    qaModerated: false,
    allowAnonymous: false,
  },

  /** Opinion collection. Never graded; the room does not see the split. */
  SURVEY: {
    scoringEnabled: false,
    speedBonusEnabled: false,
    streakBonusEnabled: false,
    leaderboardVisibility: 'HIDDEN',
    scoreboardBetweenQuestions: false,
    podiumAtEnd: false,
    resultsReveal: 'NEVER',
    autoAdvance: false,
    phoneShowsQuestion: true,
    soundEnabled: false,
    qaEnabled: false,
    qaModerated: false,
    allowAnonymous: true,
  },
};

/**
 * The switch bundle for a preset, or null for CUSTOM — and null for anything
 * unrecognised.
 *
 * The unknown case matters: spreading an undefined preset yields `{}`, which is
 * truthy, so a caller checking `if (bundle)` would have accepted it and written
 * an event with every switch blank.
 */
export const presetSwitches = (preset: string): SessionSwitches | null => {
  if (preset === 'CUSTOM') return null;
  const bundle = PRESETS[preset as Exclude<SessionPreset, 'CUSTOM'>];
  return bundle ? { ...bundle } : null;
};

/** Whether a string names a preset this build knows about. */
export const isKnownPreset = (value: string): value is SessionPreset =>
  value === 'CUSTOM' || Object.prototype.hasOwnProperty.call(PRESETS, value);

/**
 * Which preset, if any, a set of switches currently matches.
 *
 * Used so a host who happens to reassemble a preset by hand sees its name
 * again, rather than being stuck on "Custom" forever.
 */
export const matchPreset = (switches: SessionSwitches): SessionPreset => {
  for (const name of Object.keys(PRESETS) as Exclude<SessionPreset, 'CUSTOM'>[]) {
    const candidate = PRESETS[name];
    const same = SWITCH_KEYS.every((key) => switches[key] === candidate[key]);
    if (same) return name;
  }
  return 'CUSTOM';
};

/* ------------------------------------------------------------------ */
/* Guard rules                                                         */
/* ------------------------------------------------------------------ */

export interface Conflict {
  /** The switch that is being constrained. */
  field: keyof SessionSwitches;
  /** The switch that causes the constraint. */
  because: keyof SessionSwitches;
  severity: 'forced' | 'warning';
  message: string;
}

/**
 * Applies the combinations that genuinely cannot work.
 *
 * Two kinds of rule, and the difference matters:
 *
 *  - `forced`  — the combination is meaningless, so the dependent switch is
 *                overridden. A podium with no scores has nothing to rank.
 *  - `warning` — the combination is legal and will run, but the host probably
 *                did not intend it. These are surfaced, never overridden;
 *                silently changing a setting somebody deliberately chose is
 *                worse than letting them do something odd.
 *
 * Returns the corrected switches plus everything that was adjusted or flagged,
 * so the UI can grey a control out and say why instead of just disabling it.
 */
export const resolveSwitches = (
  input: SessionSwitches
): { switches: SessionSwitches; conflicts: Conflict[] } => {
  const out: SessionSwitches = { ...input };
  const conflicts: Conflict[] = [];

  const force = <K extends keyof SessionSwitches>(
    field: K,
    value: SessionSwitches[K],
    because: keyof SessionSwitches,
    message: string
  ) => {
    if (out[field] === value) return;
    out[field] = value;
    conflicts.push({ field, because, severity: 'forced', message });
  };

  const warn = (field: keyof SessionSwitches, because: keyof SessionSwitches, message: string) => {
    conflicts.push({ field, because, severity: 'warning', message });
  };

  // --- Scoring is the root switch. With it off, the whole competitive half of
  // the product has nothing to operate on.
  if (!out.scoringEnabled) {
    force('speedBonusEnabled', false, 'scoringEnabled', 'There is no score for speed to add to.');
    force('streakBonusEnabled', false, 'scoringEnabled', 'There is no score for a streak to add to.');
    force('podiumAtEnd', false, 'scoringEnabled', 'A podium needs scores to rank people by.');
    force(
      'scoreboardBetweenQuestions',
      false,
      'scoringEnabled',
      'A scoreboard needs scores to show.'
    );
    force(
      'leaderboardVisibility',
      'HIDDEN',
      'scoringEnabled',
      'A leaderboard needs scores to order.'
    );
  }

  // --- Speed and streak bonuses are meaningless without a timer, but the timer
  // lives per question, so this is checked separately in `describeQuestionRisks`.

  // --- Q&A moderation without Q&A.
  if (!out.qaEnabled) {
    force('qaModerated', false, 'qaEnabled', 'There are no questions to moderate.');
  }

  // --- Results the audience never sees cannot be revealed to them.
  if (out.resultsReveal === 'NEVER') {
    // Not forced: a host may legitimately want standings shown while keeping
    // the per-question split private.
    if (out.scoreboardBetweenQuestions) {
      warn(
        'scoreboardBetweenQuestions',
        'resultsReveal',
        'Results stay hidden, but the scoreboard will still show standings.'
      );
    }
  }

  // --- A public leaderboard of anonymous people is a list of blanks.
  if (out.allowAnonymous && out.leaderboardVisibility === 'EVERYONE' && out.scoringEnabled) {
    warn(
      'leaderboardVisibility',
      'allowAnonymous',
      'Anyone who joins without a name appears unnamed on the leaderboard.'
    );
  }

  // --- Hiding the question from phones only works if something else shows it.
  if (!out.phoneShowsQuestion) {
    warn(
      'phoneShowsQuestion',
      'phoneShowsQuestion',
      'Open the Audience Display on a shared screen — phones will show only the answer tiles.'
    );
  }

  return { switches: out, conflicts };
};

/**
 * Risks that depend on the questions rather than on other switches.
 * Separate because the caller has to load the questions to check them.
 */
export const describeQuestionRisks = (
  switches: SessionSwitches,
  questions: { timeLimit: number | null }[]
): string[] => {
  const risks: string[] = [];
  const untimed = questions.filter((question) => !question.timeLimit).length;

  if (switches.speedBonusEnabled && untimed > 0) {
    risks.push(
      `${untimed} question${untimed === 1 ? '' : 's'} ${untimed === 1 ? 'has' : 'have'} no timer, so the speed bonus cannot apply there.`
    );
  }

  if (switches.autoAdvance && untimed > 0) {
    risks.push(
      `${untimed} question${untimed === 1 ? '' : 's'} ${untimed === 1 ? 'has' : 'have'} no timer, so the session will wait for you there.`
    );
  }

  return risks;
};

/* ------------------------------------------------------------------ */
/* Per-question resolution                                             */
/* ------------------------------------------------------------------ */

/**
 * Whether one specific question is graded.
 *
 * This is the mechanism that lets a single session hold unscored opinion polls
 * and scored quiz questions — the "mix" case. A question can opt in even when
 * the session is unscored, and opt out when it is scored.
 */
export const isQuestionScored = (
  sessionScoringEnabled: boolean,
  override: ScoredOverride
): boolean => {
  if (override === 'YES') return true;
  if (override === 'NO') return false;
  return sessionScoringEnabled;
};

/** The legacy `sessionMode` column, derived. Never set by hand. */
export const deriveSessionMode = (scoringEnabled: boolean): 'QUIZ' | 'SURVEY' =>
  scoringEnabled ? 'QUIZ' : 'SURVEY';
