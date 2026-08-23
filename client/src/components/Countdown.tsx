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
}

const Countdown: React.FC<Props> = ({ startedAt, timeLimit, onExpire, compact = false }) => {
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

  const colour = done ? '#9CA3AF' : urgent ? '#F43F5E' : '#6366F1';

  if (compact) {
    return (
      <span
        className="font-mono font-bold tabular-nums text-sm px-2.5 py-1 rounded-full border"
        style={{ color: colour, borderColor: `${colour}55`, backgroundColor: `${colour}12` }}
        role="timer"
        aria-live={urgent ? 'assertive' : 'off'}
      >
        {done ? "Time's up" : `${remaining}s`}
      </span>
    );
  }

  return (
    <div className="space-y-1.5" role="timer" aria-live={urgent ? 'assertive' : 'off'}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
          {done ? "Time's up" : 'Time remaining'}
        </span>
        <span className="font-mono font-bold tabular-nums text-lg" style={{ color: colour }}>
          {remaining}s
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-linear"
          style={{ width: `${fraction * 100}%`, backgroundColor: colour }}
        />
      </div>
    </div>
  );
};

export default Countdown;
