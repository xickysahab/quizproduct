import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Printer, Users } from 'lucide-react';
import api from '../../services/api';

interface Row {
  participantId: string;
  name: string;
  score: number;
  rank: number;
}

/**
 * How the session went: everyone in rank order, each a link to their own
 * report. One list rather than a leaderboard and a second list of the same
 * people underneath it.
 */
const EventResults: React.FC<{ eventId: string; scored: boolean }> = ({ eventId, scored }) => {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    api
      .get(`/analytics/events/${eventId}/leaderboard`, { params: { limit: 200 } })
      .then((r) => setRows(r.data.leaderboard || []))
      .catch(() => setRows([]));
  }, [eventId]);

  if (rows === null) {
    return <div className="h-40 rounded-2xl bg-gray-100 animate-pulse" aria-label="Loading results" />;
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 px-6 rounded-2xl bg-surface border border-line">
        <div className="w-12 h-12 rounded-full bg-gray-100 grid place-items-center mx-auto mb-4 text-muted">
          <Users className="w-5 h-5" />
        </div>
        <p className="text-[17px] font-semibold text-ink">No one has joined yet</p>
        <p className="text-sm text-muted mt-1">Results appear here once people answer.</p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {rows.length} {rows.length === 1 ? 'person' : 'people'} · tap anyone for their report
        </p>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent print:hidden">
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <ol className="rounded-2xl bg-surface border border-line divide-y divide-line overflow-hidden">
        {rows.map((row) => (
          <li key={row.participantId}>
            <Link
              to={`/events/${eventId}/participants/${row.participantId}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50"
            >
              {scored && <span className="w-6 text-sm font-semibold text-faint tabular">{row.rank}</span>}
              <span className="flex-1 min-w-0 truncate text-[15px] font-medium text-ink">{row.name || 'Anonymous'}</span>
              {scored && <span className="text-[15px] font-semibold tabular text-ink">{row.score}</span>}
              <ChevronRight className="w-4 h-4 text-faint" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default EventResults;
