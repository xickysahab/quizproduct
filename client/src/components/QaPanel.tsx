import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, MessageSquarePlus, Check, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { socket } from '../socket/socket';
import { displayName } from '../utils/session';
import { useTranslation } from '../i18n/useTranslation';

/**
 * Audience Q&A, participant side.
 *
 * Slido leaves Q&A unlimited even on its free tier while capping polls at
 * three — this is the feature people open the tab for. Questions are ranked by
 * upvotes so the room decides what gets asked, not whoever typed fastest.
 */

export interface AudienceQuestion {
  id: string;
  text: string;
  authorName: string | null;
  status: 'PENDING' | 'APPROVED' | 'ANSWERED' | 'DISMISSED';
  upvoteCount: number;
  answeredAt: string | null;
  createdAt: string;
  hasVoted: boolean;
  isMine: boolean;
}

const MAX_LENGTH = 500;

const QaPanel: React.FC = () => {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<AudienceQuestion[]>([]);
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/questions-from-audience/mine');
      setQuestions(res.data.questions || []);
    } catch {
      /* a failed refresh should not clear what is already on screen */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // The server coalesces bursts into one nudge per second, so this refetches
    // at most once a second no matter how fast the room is voting.
    socket.on('qa:updated', load);
    return () => {
      socket.off('qa:updated', load);
    };
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    setSending(true);
    try {
      const res = await api.post('/questions-from-audience', {
        text: text.trim(),
        anonymous,
      });
      setText('');
      toast.success(res.data.message || t('qa.posted'));
      await load();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t('qa.failed');
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const upvote = async (question: AudienceQuestion) => {
    // Optimistic: a vote should feel instant, and the server is the arbiter if
    // the two disagree.
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === question.id
          ? { ...q, hasVoted: !q.hasVoted, upvoteCount: q.upvoteCount + (q.hasVoted ? -1 : 1) }
          : q
      )
    );

    try {
      await api.post(`/questions-from-audience/${question.id}/upvote`);
    } catch {
      toast.error(t('qa.voteFailed'));
      await load();
    }
  };

  const visible = questions.filter((q) => q.status !== 'DISMISSED');

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-3">
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={2}
            placeholder={t("qa.placeholder")}
            className="w-full px-4 py-3 pr-16 rounded-2xl border border-gray-200 bg-white text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent resize-none"
            aria-label="Your question"
          />
          <span className="absolute bottom-3 right-4 text-[10px] font-mono text-gray-400 tabular-nums">
            {text.length}/{MAX_LENGTH}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent"
            />
            <span>{t('qa.anonymous')}</span>
          </label>

          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-btn text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>{sending ? t('qa.sending') : t('qa.ask')}</span>
          </button>
        </div>
      </form>

      {loaded && visible.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">
          {t('qa.empty')}
        </p>
      )}

      <ul className="space-y-2.5">
        <AnimatePresence initial={false}>
          {visible.map((question) => (
            <motion.li
              key={question.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex gap-3 p-4 rounded-2xl border ${
                question.status === 'ANSWERED'
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : 'bg-white border-gray-200'
              }`}
            >
              <button
                onClick={() => upvote(question)}
                disabled={question.status === 'ANSWERED'}
                aria-pressed={question.hasVoted}
                aria-label={`${t('qa.upvote')}: ${question.text}`}
                className={`flex flex-col items-center justify-center w-12 py-1.5 rounded-xl border flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  question.hasVoted
                    ? 'bg-accent border-accent text-white'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-accent-soft'
                }`}
              >
                <ChevronUp className="w-4 h-4" />
                <span className="text-sm font-bold tabular-nums">{question.upvoteCount}</span>
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 leading-snug break-words">{question.text}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px] text-gray-500">
                    {question.authorName ? displayName(question.authorName) : t('qa.anonymousLabel')}
                    {question.isMine && ` · ${t('qa.you')}`}
                  </span>

                  {question.status === 'PENDING' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                      <Clock className="w-3 h-3" />
                      {t('qa.pending')}
                    </span>
                  )}

                  {question.status === 'ANSWERED' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      <Check className="w-3 h-3" />
                      {t('qa.answered')}
                    </span>
                  )}
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
};

export default QaPanel;
