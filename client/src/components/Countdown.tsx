import React, { useEffect, useState } from 'react';

/**
 * Countdown for a timed question.
 *
 * The time limit was enforced server-side and shown to nobody, so answers were
 * rejected with "Time is up" by a UI that had never displayed a clock. This
 * counts down from the server's own `startedAt`, so every device agrees rather
 * than each starting its own timer on receipt.
 */

interface Props {
  /** ISO timestamp from the server marking when the question opened. */
  startedAt: string | null;
  /** Seconds. Null means the host advances manually. */
  timeLimit: number | null;
  onExpire?: () => void;
  compact?: boolean;
  /** `dark` for the projector / live stage. */
  tone?: 'light' | 'dark';
}

const Countdown: React.FC<Props> = ({
  startedAt,
  timeLimit,
  onExpire,
  compact = false,
  tone = 'light',
}) => {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!timeLimit || !startedAt) {
      setRemaining(null);
      return;
    }

    const deadline = new Date(startedAt).getTime() + timeLimit * 1000;
    let fired = false;

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !fired) {
        fired = true;
        onExpire?.();
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, timeLimit]);

  if (remaining === null || !timeLimit) return null;

  const fraction = Math.max(0, Math.min(1, remaining / timeLimit));
  const urgent = remaining <= 5 && remaining > 0;
  const done = remaining === 0;
  const dark = tone === 'dark';

  const colour = done ? '#9CA3AF' : urgent ? '#FB7185' : dark ? '#A5B4FC' : '#4F46E5';

  if (compact) {
    return (
      <span
        className={`font-mono font-bold tabular-nums text-sm px-2.5 py-1 rounded-full border ${
          urgent ? 'timer-urgent' : ''
        }`}
        style={{ color: colour, borderColor: `${colour}55`, backgroundColor: `${colour}18` }}
        role="timer"
        aria-live={urgent ? 'assertive' : 'off'}
      >
        {done ? "Time's up" : `${remaining}s`}
      </span>
    );
  }

  return (
    <div
      className={`space-y-2 ${urgent ? 'timer-urgent' : ''}`}
      role="timer"
      aria-live={urgent ? 'assertive' : 'off'}
    >
      <div className="flex items-baseline justify-between">
        <span
          className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
            dark ? 'text-white/50' : 'text-gray-500'
          }`}
        >
          {done ? "Time's up" : 'Time remaining'}
        </span>
        <span className="font-heading font-bold tabular-nums text-2xl" style={{ color: colour }}>
          {remaining}
          <span className="text-sm font-semibold ml-0.5">s</span>
        </span>
      </div>
      <div className={`h-2.5 w-full rounded-full overflow-hidden ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-linear"
          style={{ width: `${fraction * 100}%`, backgroundColor: colour }}
        />
      </div>
    </div>
  );
};

export default Countdown;
