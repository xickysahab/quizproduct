import React from 'react';
import { motion } from 'framer-motion';

/**
 * A segmented control. The selection is one surface that slides to the
 * segment you pick, on a spring, so switching reads as moving the same thing
 * rather than repainting two.
 */
function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  id,
}: {
  value: T;
  onChange: (value: T) => void;
  segments: { value: T; label: React.ReactNode }[];
  /** Distinguishes this control's sliding surface from any other on the page. */
  id: string;
}) {
  return (
    <div role="tablist" className="inline-flex p-0.5 rounded-[10px] bg-gray-100 border border-line/60">
      {segments.map((s) => {
        const on = s.value === value;
        return (
          <button
            key={s.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(s.value)}
            className={`relative px-4 py-1.5 text-[13px] font-semibold rounded-[8px] ${on ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {on && (
              <motion.span
                layoutId={`segment-${id}`}
                className="absolute inset-0 rounded-[8px] bg-white shadow-sm"
                aria-hidden
              />
            )}
            <span className="relative">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
