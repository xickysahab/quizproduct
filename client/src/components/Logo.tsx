import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * The mark: four bars, the way answers land on the projected screen.
 *
 * It replaced a lightning bolt in an indigo gradient tile — a shape that says
 * "an app" and nothing about this one, in a blue that fought every warm ground
 * in the product. This one is the thing a room actually looks at: a tally
 * mid-count, one bar out in front.
 *
 * The heights are deliberately uneven rather than a tidy arc. A symmetric
 * waveform reads as decoration; an uneven one reads as a reading — a real
 * count of a real room, caught partway.
 *
 * Colour comes from `currentColor` via `text-accent`, so the mark takes the
 * session's temperature with everything else: teal in a discussion, flame in a
 * game, plum in a survey. On the dark stage `.stage .text-accent` lifts it
 * automatically, so the same component works on paper and on the projected
 * screen without a variant.
 */
const Logo: React.FC<LogoProps> = ({ size = 36, className = '' }) => (
  <span
    className={`inline-flex shrink-0 items-center justify-center text-accent ${className}`}
    style={{ width: size, height: size }}
  >
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="currentColor"
      role="img"
      aria-label="QuizPulse"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Trailing votes, still coming in.

          The opacities bottom out at 0.48 rather than fading to nearly
          nothing. At 38px a 0.3 bar reads as a soft trailing count; at the
          20px this renders in a dense sidebar it reads as a rendering fault,
          and the mark comes apart into three bars and a smudge. */}
      <rect x="2" y="15" width="8" height="18" rx="4" opacity="0.48" />
      <rect x="14" y="8" width="8" height="32" rx="4" opacity="0.72" />
      {/* The leader. Solid, because it is the one the room is looking at. */}
      <rect x="26" y="2" width="8" height="44" rx="4" />
      <rect x="38" y="11" width="8" height="26" rx="4" opacity="0.58" />
    </svg>
  </span>
);

export default Logo;
