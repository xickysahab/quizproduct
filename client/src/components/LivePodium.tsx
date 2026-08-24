import React from 'react';
import type { LeaderboardRow } from '../types/analytics';

export const displayName = (name?: string | null) => {
  const trimmed = (name || '').trim();
  return trimmed || 'Anonymous';
};

interface LivePodiumProps {
  rows: LeaderboardRow[];
  meId?: string | null;
  standing?: { rank: number; score: number; totalParticipants: number } | null;
  tone?: 'light' | 'dark';
  /** `mini` under an answer. `stage` for host / projector. */
  size?: 'mini' | 'stage';
}

const medal = (rank: number) => {
  if (rank === 1) return { bg: '#F59E0B', label: '1st' };
  if (rank === 2) return { bg: '#94A3B8', label: '2nd' };
  if (rank === 3) return { bg: '#D97706', label: '3rd' };
  return { bg: '#6366F1', label: `${rank}` };
};

/**
 * Kahoot-style race board. Same rows on the phone, the host laptop, and the
 * projector so the room is looking at one race, not three different lists.
 */
const LivePodium: React.FC<LivePodiumProps> = ({
  rows,
  meId,
  standing,
  tone = 'light',
  size = 'mini',
}) => {
  const dark = tone === 'dark';
  const top = rows.slice(0, size === 'stage' ? 8 : 5);
  const firstThree = top.filter((row) => row.rank <= 3).sort((a, b) => a.rank - b.rank);
  // Visual podium: 2nd · 1st · 3rd
  const podiumOrder = [firstThree.find((r) => r.rank === 2), firstThree.find((r) => r.rank === 1), firstThree.find((r) => r.rank === 3)].filter(
    Boolean
  ) as LeaderboardRow[];
  const rest = top.filter((row) => row.rank > 3);
  const meOnBoard = meId ? top.some((row) => row.participantId === meId) : false;

  return (
    <div className={dark ? 'text-white' : 'text-gray-900'}>
      {standing && (
        <div
          className={`mb-4 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${
            dark ? 'bg-white/10 border border-white/10' : 'bg-accent-wash border border-accent-soft'
          }`}
        >
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${dark ? 'text-accent-lift' : 'text-accent'}`}>
              Your place
            </p>
            <p className="font-heading text-xl font-bold mt-0.5">
              #{standing.rank}
              <span className={`text-sm font-semibold ml-1.5 ${dark ? 'text-white/50' : 'text-gray-500'}`}>
                of {standing.totalParticipants}
              </span>
            </p>
          </div>
          <p className="font-heading text-2xl font-bold tabular-nums">
            {standing.score}
            <span className={`text-xs font-semibold ml-1 ${dark ? 'text-white/45' : 'text-gray-400'}`}>pts</span>
          </p>
        </div>
      )}

      {size === 'stage' && podiumOrder.length > 0 && (
        <div className="grid grid-cols-3 gap-2 items-end mb-5">
          {podiumOrder.map((row) => {
            const tall = row.rank === 1;
            const mine = row.participantId === meId;
            const { bg, label } = medal(row.rank);
            return (
              <div
                key={row.participantId}
                className={`rounded-2xl px-3 py-4 text-center ${
                  tall ? 'py-6' : 'py-4'
                } ${dark ? 'bg-white/8 border border-white/10' : 'bg-white border border-gray-200'} ${
                  mine ? 'ring-2 ring-amber-400' : ''
                }`}
              >
                <span
                  className="inline-flex w-8 h-8 rounded-full text-white text-xs font-bold items-center justify-center"
                  style={{ backgroundColor: bg }}
                >
                  {label}
                </span>
                <p className="font-heading font-bold text-sm mt-2 truncate">{displayName(row.name)}</p>
                <p className="font-heading text-lg font-bold tabular-nums mt-0.5">{row.score}</p>
              </div>
            );
          })}
        </div>
      )}

      <ol className="space-y-1.5">
        {(size === 'stage' ? rest : top).map((row) => {
          const mine = row.participantId === meId;
          const { bg } = medal(row.rank);
          return (
            <li
              key={row.participantId}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${
                mine
                  ? dark
                    ? 'bg-amber-400/15 border border-amber-300/30'
                    : 'bg-amber-50 border border-amber-200'
                  : dark
                    ? 'bg-white/5'
                    : 'bg-gray-50'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-6 h-6 rounded-md text-[11px] font-bold text-white flex items-center justify-center flex-shrink-0 tabular-nums"
                  style={{ backgroundColor: bg }}
                >
                  {row.rank}
                </span>
                <span className="truncate font-medium">
                  {displayName(row.name)}
                  {mine ? ' · you' : ''}
                </span>
              </span>
              <span className="font-heading font-bold tabular-nums flex-shrink-0">{row.score}</span>
            </li>
          );
        })}
      </ol>

      {standing && !meOnBoard && standing.rank > top.length && (
        <p className={`text-xs mt-3 ${dark ? 'text-white/45' : 'text-gray-500'}`}>
          Keep scoring to climb into the top {top.length}.
        </p>
      )}
    </div>
  );
};

export default LivePodium;
