/**
 * Shared answer-tile colours for live play.
 *
 * Kahoot's energy comes from four saturated, instantly-recognisable tiles —
 * not from a wall of identical indigo cards. These are our own palette
 * (rose / blue / amber / green), reused on the phone, the host stage, and
 * result bars so a colour means the same option everywhere.
 */

export type OptionTheme = {
  fill: string;
  soft: string;
  ink: string;
};

export const OPTION_THEME: OptionTheme[] = [
  { fill: '#E11D48', soft: '#FFE4E6', ink: '#9F1239' },
  { fill: '#2563EB', soft: '#DBEAFE', ink: '#1E3A8A' },
  { fill: '#D97706', soft: '#FEF3C7', ink: '#92400E' },
  { fill: '#059669', soft: '#D1FAE5', ink: '#065F46' },
  { fill: '#7C3AED', soft: '#EDE9FE', ink: '#5B21B6' },
  { fill: '#0891B2', soft: '#CFFAFE', ink: '#155E75' },
];

export const optionTheme = (index: number): OptionTheme =>
  OPTION_THEME[index % OPTION_THEME.length]!;

export const optionFills = OPTION_THEME.map((theme) => theme.fill);

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
