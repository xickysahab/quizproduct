import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  presetSwitches,
  isKnownPreset,
  matchPreset,
  resolveSwitches,
  describeQuestionRisks,
  isQuestionScored,
  deriveSessionMode,
  SWITCH_KEYS,
} from '../utils/sessionSettings';
import type { SessionSwitches } from '../utils/sessionSettings';

const game = (): SessionSwitches => ({ ...PRESETS.GAME });
const discussion = (): SessionSwitches => ({ ...PRESETS.DISCUSSION });

describe('presets', () => {
  it('Discussion is unscored and Q&A-led — nobody loses', () => {
    expect(PRESETS.DISCUSSION.scoringEnabled).toBe(false);
    expect(PRESETS.DISCUSSION.qaEnabled).toBe(true);
    expect(PRESETS.DISCUSSION.podiumAtEnd).toBe(false);
  });

  it('Game is a scored race with standings and a podium', () => {
    expect(PRESETS.GAME.scoringEnabled).toBe(true);
    expect(PRESETS.GAME.speedBonusEnabled).toBe(true);
    expect(PRESETS.GAME.streakBonusEnabled).toBe(true);
    expect(PRESETS.GAME.scoreboardBetweenQuestions).toBe(true);
    expect(PRESETS.GAME.podiumAtEnd).toBe(true);
  });

  it('Survey never grades and never shows the room the split', () => {
    expect(PRESETS.SURVEY.scoringEnabled).toBe(false);
    expect(PRESETS.SURVEY.resultsReveal).toBe('NEVER');
  });

  it('every preset is internally consistent — resolving one changes nothing', () => {
    // A preset that its own guard rules would immediately correct is a bug in
    // the preset, not in the rules.
    for (const name of ['DISCUSSION', 'GAME', 'SURVEY'] as const) {
      const { switches, conflicts } = resolveSwitches({ ...PRESETS[name] });
      expect(switches).toEqual(PRESETS[name]);
      expect(conflicts.filter((c) => c.severity === 'forced')).toEqual([]);
    }
  });

  it('CUSTOM has no bundle of its own', () => {
    expect(presetSwitches('CUSTOM')).toBeNull();
  });

  it('an unknown preset yields null, not an empty bundle', () => {
    // Spreading an undefined preset gives {}, which is truthy — a caller
    // checking `if (bundle)` would then have written every switch blank.
    expect(presetSwitches('NONSENSE')).toBeNull();
    expect(isKnownPreset('NONSENSE')).toBe(false);
    expect(isKnownPreset('GAME')).toBe(true);
    expect(isKnownPreset('CUSTOM')).toBe(true);
  });
});

describe('preset matching', () => {
  it('recognises an unchanged preset', () => {
    expect(matchPreset(game())).toBe('GAME');
    expect(matchPreset(discussion())).toBe('DISCUSSION');
  });

  it('falls to CUSTOM once any switch is changed', () => {
    expect(matchPreset({ ...game(), soundEnabled: false })).toBe('CUSTOM');
  });

  it('returns to the preset name if the host reassembles it by hand', () => {
    const wandered = { ...game(), soundEnabled: false };
    expect(matchPreset({ ...wandered, soundEnabled: true })).toBe('GAME');
  });
});

describe('guard rules — combinations that cannot work', () => {
  it('turning scoring off strips every competitive switch', () => {
    const { switches, conflicts } = resolveSwitches({ ...game(), scoringEnabled: false });

    expect(switches.speedBonusEnabled).toBe(false);
    expect(switches.streakBonusEnabled).toBe(false);
    expect(switches.podiumAtEnd).toBe(false);
    expect(switches.scoreboardBetweenQuestions).toBe(false);
    expect(switches.leaderboardVisibility).toBe('HIDDEN');

    // And says why, for each one — the UI greys the control and shows this.
    const forced = conflicts.filter((c) => c.severity === 'forced');
    expect(forced).toHaveLength(5);
    expect(forced.every((c) => c.because === 'scoringEnabled')).toBe(true);
    expect(forced.every((c) => c.message.length > 0)).toBe(true);
  });

  it('moderation is dropped when Q&A itself is off', () => {
    const { switches, conflicts } = resolveSwitches({
      ...discussion(),
      qaEnabled: false,
      qaModerated: true,
    });

    expect(switches.qaModerated).toBe(false);
    expect(conflicts.some((c) => c.field === 'qaModerated' && c.severity === 'forced')).toBe(true);
  });

  it('has no anonymity switch to conflict with — every participant is named', () => {
    // Anonymous joining was removed as a product decision, so the leaderboard
    // can never be a list of blanks and the old warning has nothing to fire on.
    expect(SWITCH_KEYS).not.toContain('allowAnonymous');
    const { conflicts } = resolveSwitches({ ...game(), leaderboardVisibility: 'EVERYONE' });
    expect(conflicts.filter((c) => c.severity === 'warning' && c.field === 'leaderboardVisibility'))
      .toEqual([]);
  });

  it('never silently overrides a warning-level choice', () => {
    // phoneShowsQuestion carries a warning, never a correction.
    const input = { ...game(), phoneShowsQuestion: false };
    const { switches } = resolveSwitches(input);
    expect(switches.phoneShowsQuestion).toBe(false);
  });

  it('is idempotent — resolving twice gives the same answer', () => {
    const once = resolveSwitches({ ...game(), scoringEnabled: false });
    const twice = resolveSwitches(once.switches);
    expect(twice.switches).toEqual(once.switches);
    expect(twice.conflicts.filter((c) => c.severity === 'forced')).toEqual([]);
  });

  it('leaves a valid combination completely alone', () => {
    const mixed: SessionSwitches = {
      ...game(),
      qaEnabled: true,
      qaModerated: true,
      scoreboardBetweenQuestions: false,
    };
    const { switches, conflicts } = resolveSwitches(mixed);
    expect(switches).toEqual(mixed);
    expect(conflicts.filter((c) => c.severity === 'forced')).toEqual([]);
  });

  it('covers every switch key without omission', () => {
    // Guards against a switch being added to the type and forgotten here.
    expect(SWITCH_KEYS).toHaveLength(Object.keys(PRESETS.GAME).length);
  });
});

describe('question-level risks', () => {
  it('flags a speed bonus on questions with no timer', () => {
    const risks = describeQuestionRisks(game(), [{ timeLimit: 30 }, { timeLimit: null }]);
    expect(risks.some((r) => r.includes('speed bonus'))).toBe(true);
    expect(risks.some((r) => r.startsWith('1 question has'))).toBe(true);
  });

  it('says nothing when every question is timed', () => {
    expect(describeQuestionRisks(game(), [{ timeLimit: 20 }])).toEqual([]);
  });

  it('flags auto-advance stalling on an untimed question', () => {
    const risks = describeQuestionRisks({ ...game(), autoAdvance: true }, [{ timeLimit: null }]);
    expect(risks.some((r) => r.includes('wait for you'))).toBe(true);
  });
});

describe('per-question scoring override — the mixing mechanism', () => {
  it('inherits the session switch by default', () => {
    expect(isQuestionScored(true, 'INHERIT')).toBe(true);
    expect(isQuestionScored(false, 'INHERIT')).toBe(false);
  });

  it('lets a scored question sit inside an unscored session', () => {
    // A town hall that ends with one graded quiz question.
    expect(isQuestionScored(false, 'YES')).toBe(true);
  });

  it('lets an unscored question sit inside a scored session', () => {
    // A quiz that opens with an ungraded opinion poll.
    expect(isQuestionScored(true, 'NO')).toBe(false);
  });
});

describe('legacy sessionMode derivation', () => {
  it('mirrors scoringEnabled so existing checks keep working', () => {
    expect(deriveSessionMode(true)).toBe('QUIZ');
    expect(deriveSessionMode(false)).toBe('SURVEY');
  });
});
