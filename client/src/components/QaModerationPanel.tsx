import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Check, X, Eye, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { socket } from '../socket/socket';
import type { AudienceQuestion } from './QaPanel';

/**
 * Audience Q&A, host side — the moderation queue.
 *
 * The host sees every question including PENDING and DISMISSED, which
 * participants never do.
 */

interface Props {
  eventId: string;
}

type Status = AudienceQuestion['status'];

const QaModerationPanel: React.FC<Props> = ({ eventId }) => {
  const [questions, setQuestions] = useState<AudienceQuestion[]>([]);
  const [qaEnabled, setQaEnabled] = useState(true);
  const [qaModerated, setQaModerated] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'answered'>('all');

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/questions-from-audience/event/${eventId}`);
      setQuestions(res.data.questions || []);
      setQaEnabled(res.data.qaEnabled);
      setQaModerated(res.data.qaModerated);
    } catch {
      /* keep the current list rather than blanking it on a failed refresh */
    }
  }, [eventId]);

  useEffect(() => {
    void load();
    socket.on('qa:updated', load);
    return () => {
      socket.off('qa:updated', load);
    };
  }, [load]);

  const setStatus = async (question: AudienceQuestion, status: Status) => {
    setQuestions((prev) => prev.map((q) => (q.id === question.id ? { ...q, status } : q)));
    try {
      await api.patch(`/questions-from-audience/${question.id}`, { status });
    } catch {
      toast.error('Could not update that question.');
      await load();
    }
  };

  const updateSettings = async (patch: { qaEnabled?: boolean; qaModerated?: boolean }) => {
    try {
      const res = await api.patch(`/questions-from-audience/event/${eventId}/settings`, patch);
      setQaEnabled(res.data.qaEnabled);
      setQaModerated(res.data.qaModerated);
    } catch {
      toast.error('Could not update Q&A settings.');
    }
  };

  const pendingCount = questions.filter((q) => q.status === 'PENDING').length;

  const visible = questions.filter((q) => {
    if (filter === 'pending') return q.status === 'PENDING';
    if (filter === 'answered') return q.status === 'ANSWERED';
    return q.status !== 'DISMISSED';
  });

  const TABS: { key: typeof filter; label: string; count?: number }[] = [
    { key: 'all', label: 'Open' },
    { key: 'pending', label: 'To review', count: pendingCount },
    { key: 'answered', label: 'Answered' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-5 space-y-4 text-left">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-heading text-lg font-bold text-gray-900">Audience questions</h3>

        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-600">
            <input
              type="checkbox"
              checked={qaEnabled}
              onChange={(e) => updateSettings({ qaEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Accepting</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-600">
            <input
              type="checkbox"
              checked={qaModerated}
              onChange={(e) => updateSettings({ qaModerated: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Review first
            </span>
          </label>
        </div>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === tab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            {tab.count ? (
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 text-[10px] tabular-nums">
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-gray-500 py-6 text-center">Nothing here yet.</p>
      )}

      <ul className="space-y-2 max-h-[420px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {visible.map((question) => (
            <motion.li
              key={question.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex gap-3 p-3.5 rounded-2xl border ${
                question.status === 'ANSWERED'
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : question.status === 'PENDING'
                    ? 'bg-amber-50/60 border-amber-200'
                    : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex flex-col items-center justify-center w-11 py-1 rounded-xl bg-white border border-gray-200 flex-shrink-0">
                <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-sm font-bold tabular-nums text-gray-900">
                  {question.upvoteCount}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 leading-snug break-words">{question.text}</p>
                <span className="text-[11px] text-gray-500">
                  {question.authorName || 'Anonymous'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {question.status === 'PENDING' && (
                  <button
                    onClick={() => setStatus(question, 'APPROVED')}
                    title="Show to the room"
                    aria-label="Approve question"
                    className="p-2 rounded-lg bg-white border border-gray-200 text-indigo-600 hover:bg-indigo-50"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}

                {question.status !== 'ANSWERED' && (
                  <button
                    onClick={() => setStatus(question, 'ANSWERED')}
                    title="Mark answered"
                    aria-label="Mark question answered"
                    className="p-2 rounded-lg bg-white border border-gray-200 text-emerald-600 hover:bg-emerald-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={() => setStatus(question, 'DISMISSED')}
                  title="Dismiss"
                  aria-label="Dismiss question"
                  className="p-2 rounded-lg bg-white border border-gray-200 text-rose-600 hover:bg-rose-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
};

export default QaModerationPanel;
