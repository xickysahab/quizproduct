import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import api from '../services/api';

interface EventRow {
  id: string;
  title: string;
  isLive: boolean;
  selfPaced?: boolean;
  _count?: { questions?: number; participants?: number };
}

/**
 * The quizzes a host was just working on, one tap from the overview — the
 * thing people come back for, where "quick actions" used to repeat the sidebar.
 */
const RecentQuizzes: React.FC<{ allHref: string }> = ({ allHref }) => {
  const [events, setEvents] = useState<EventRow[] | null>(null);

  useEffect(() => {
    api
      .get('/events', { params: { page: 1, limit: 5 } })
      .then((res) => setEvents(res.data.events || []))
      .catch(() => setEvents([]));
  }, []);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[22px] font-bold text-ink">Recent quizzes</h2>
        <Link to={allHref} className="text-[15px] text-accent">
          See all
        </Link>
      </div>

      {events === null ? (
        <div className="h-48 rounded-2xl bg-gray-100 animate-pulse" aria-label="Loading" />
      ) : events.length === 0 ? (
        <p className="rounded-2xl bg-surface border border-line px-5 py-8 text-center text-[15px] text-muted">
          Nothing yet. Start one with New quiz.
        </p>
      ) : (
        <ul className="rounded-2xl bg-surface border border-line divide-y divide-line overflow-hidden">
          {events.map((e) => (
            <li key={e.id}>
              <Link to={`/events/${e.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold text-ink truncate">{e.title}</p>
                  <p className="text-[13px] text-muted">
                    {e._count?.questions ?? 0} questions · {e._count?.participants ?? 0} joined
                    {e.selfPaced ? ' · Homework' : ''}
                  </p>
                </div>
                {e.isLive && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red-600">
                    <span className="w-2 h-2 rounded-full bg-red-500 live-dot" /> Live
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-faint shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default RecentQuizzes;
