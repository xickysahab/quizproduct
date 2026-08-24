/**
 * Maps a session to the colour temperature it should run at.
 *
 * The accent is not decoration here — it tells a host glancing up which kind of
 * room they are in before they read a word. A Discussion runs cool, a Game runs
 * hot, a Survey runs neutral.
 *
 * Applied by putting `data-mode` on a container; everything inside retints,
 * because the whole system reads `var(--accent)` rather than a fixed hue.
 */

export type ThemeMode = 'discussion' | 'game' | 'survey';

interface SessionLike {
  preset?: string | null;
  sessionMode?: string | null;
  scoringEnabled?: boolean | null;
  qaEnabled?: boolean | null;
}

/**
 * Preset first, since it is the host's stated intent. Falling back to the
 * switches keeps a Custom session honest: scored means hot, Q&A-led means cool,
 * and anything else is neutral.
 */
export const themeFor = (session: SessionLike | null | undefined): ThemeMode => {
  if (!session) return 'discussion';

  switch (session.preset) {
    case 'GAME':
      return 'game';
    case 'DISCUSSION':
      return 'discussion';
    case 'SURVEY':
      return 'survey';
    default:
      break;
  }

  const scored = session.scoringEnabled ?? session.sessionMode !== 'SURVEY';
  if (scored) return 'game';
  return session.qaEnabled ? 'discussion' : 'survey';
};

/** Human label, for the badge that sits beside the session title. */
export const themeLabel = (mode: ThemeMode): string =>
  mode === 'game' ? 'Game' : mode === 'survey' ? 'Survey' : 'Discussion';
