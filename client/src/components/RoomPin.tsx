import React from 'react';

interface RoomPinProps {
  code: string;
  /** `hero` for projector / lobby. `chip` for headers. */
  size?: 'hero' | 'chip';
  tone?: 'light' | 'dark';
}

/**
 * The join PIN is the product. Slido and Kahoot both treat it as the biggest
 * object in the lobby — a 14px mono chip on a SaaS header is why rooms feel
 * small. This is the shared treatment.
 */
const RoomPin: React.FC<RoomPinProps> = ({ code, size = 'chip', tone = 'light' }) => {
  const dark = tone === 'dark';

  if (size === 'hero') {
    return (
      <div
        className={`inline-flex flex-col items-center px-8 py-5 rounded-[2rem] ${
          dark ? 'bg-white text-slate-950' : 'bg-slate-950 text-white'
        }`}
      >
        <span
          className={`text-[11px] font-bold uppercase tracking-[0.35em] ${
            dark ? 'text-slate-500' : 'text-indigo-300'
          }`}
        >
          Join with PIN
        </span>
        <span className="font-heading font-bold tracking-[0.18em] text-5xl md:text-7xl tabular-nums mt-1">
          {code}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`px-4 py-2 rounded-2xl text-center ${
        dark ? 'bg-white/10 border border-white/15' : 'bg-slate-950 text-white'
      }`}
    >
      <span
        className={`text-[9px] tracking-[0.22em] uppercase font-bold block ${
          dark ? 'text-indigo-300' : 'text-indigo-300'
        }`}
      >
        PIN
      </span>
      <span className="font-heading font-bold tracking-[0.16em] text-2xl tabular-nums">{code}</span>
    </div>
  );
};

export default RoomPin;
