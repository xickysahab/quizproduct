import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, Award, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';
import { socket, connectAsParticipant } from '../socket/socket';
import api from '../services/api';
import type { LiveQuestion, QuestionTally } from '../types/analytics';
import Countdown from '../components/Countdown';
import QaPanel from '../components/QaPanel';
import QuestionResults from '../components/QuestionResults';
import LanguagePicker from '../components/LanguagePicker';
import { useTranslation } from '../i18n/useTranslation';
import { enqueue, flushQueue, onQueueChange, pendingCount, startAutoFlush } from '../utils/answerQueue';
import { motion, AnimatePresence } from 'framer-motion';

const LiveQuiz: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [participantName, setParticipantName] = useState<string | null>(null);
  // Typed as the participant-safe shape: no correctOption, no correctOptions.
  const [activeQuestion, setActiveQuestion] = useState<LiveQuestion | null>(null);
  const [currentSelection, setCurrentSelection] = useState<number | null>(null);
  const [multiSelection, setMultiSelection] = useState<number[]>([]);
  const [ranking, setRanking] = useState<number[]>([]);
  const [textAnswer, setTextAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [quizEnded, setQuizEnded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [results, setResults] = useState<(QuestionTally & { correctOption: number | null; correctOptions: number[] }) | null>(null);
  const [tab, setTab] = useState<'poll' | 'qa'>('poll');
  const [qaEnabled, setQaEnabled] = useState(true);
  const [queued, setQueued] = useState(0);
  const [myResult, setMyResult] = useState<{ score: number; rank: number; totalParticipants: number } | null>(null);

  useEffect(() => {
    const pName = localStorage.getItem('participantName');
    const pId = localStorage.getItem('participantId');
    const eId = localStorage.getItem('eventId');
    const pToken = localStorage.getItem('participantToken');

    // The token is what proves the session — a name is optional now that
    // joining anonymously is allowed, so it is not part of this guard.
    if (!pId || !eId || !pToken) {
      navigate('/');
      return;
    }

    setParticipantName(pName && pName.trim() ? pName : 'Anonymous');
    setQaEnabled(localStorage.getItem('qaEnabled') !== 'false');

    connectAsParticipant();

    // Socket.IO reconnects on its own after a network blip — routine on venue
    // wifi — but a new connection is not in the event room until it rejoins.
    // Without this the participant sits on "waiting for the host" forever.
    const handleConnect = () => {
      setConnected(true);
      socket.emit('participant:join');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setConnected(false));
    if (socket.connected) handleConnect();

    // Answers buffered while offline go out as soon as the network returns.
    setQueued(pendingCount());
    const stopQueueWatch = onQueueChange(setQueued);
    const stopAutoFlush = startAutoFlush();

    socket.on(
      'participant:questionActive',
      ({ question, selectedOption, selectedOptions, answerText, startedAt: openedAt }) => {
        const hasAnswer =
          (selectedOption !== undefined && selectedOption !== null) ||
          (Array.isArray(selectedOptions) && selectedOptions.length > 0) ||
          Boolean(answerText);

        setCurrentSelection(selectedOption ?? null);
        setMultiSelection(Array.isArray(selectedOptions) ? selectedOptions : []);
        // A ranking starts in the question's own order, so the participant is
        // reordering something rather than building a list from nothing.
        setRanking(question.type === 'RANKING' ? question.options.map((_: string, i: number) => i) : []);
        setTextAnswer(answerText || '');
        setSubmitted(hasAnswer);
        setActiveQuestion(question);
        setStartedAt(openedAt ?? null);
        setExpired(false);
        setResults(null);
        setTab('poll');
      }
    );

    // The host decides when the room sees the distribution.
    socket.on('participant:results', (payload) => setResults(payload));

    socket.on('participant:quizEnded', async () => {
      setQuizEnded(true);
      setActiveQuestion(null);
      try {
        const res = await api.get('/participants/me');
        setMyResult(res.data);
      } catch {
        /* score is optional */
      }
    });

    socket.on('participant:unauthorized', ({ message }) => {
      toast.error(message || 'Session expired. Please rejoin the room.');
      localStorage.removeItem('participantToken');
      navigate('/');
    });

    return () => {
      stopQueueWatch();
      stopAutoFlush();
      socket.off('connect', handleConnect);
      socket.off('disconnect');
      socket.off('participant:questionActive');
      socket.off('participant:results');
      socket.off('participant:quizEnded');
      socket.off('participant:unauthorized');
      socket.disconnect();
    };
  }, [navigate]);

  const submitAnswer = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!activeQuestion) return false;

    try {
      await api.post('/participants/response', {
        questionId: activeQuestion.id,
        ...payload,
      });
      // The host's counter is driven by the server from accepted responses —
      // the client no longer nudges it, because that was spammable.
      setSubmitted(true);
      return true;
    } catch (error: any) {
      if (error.response?.status === 401) {
        localStorage.removeItem('participantToken');
        toast.error(t('live.sessionExpired'));
        navigate('/');
        return false;
      }

      // No response at all means the network dropped, not that the server
      // rejected the answer — hold it and send it when the connection returns
      // rather than silently losing it.
      if (!error.response) {
        enqueue(activeQuestion.id, payload);
        setSubmitted(true);
        toast.success(t('live.offlineQueued'));
        void flushQueue();
        return true;
      }

      toast.error(error.response?.data?.message || t('live.timeUpMessage'));
      return false;
    }
  };

  const submitMcq = async (index: number) => {
    const previousSelection = currentSelection;
    setCurrentSelection(index);
    const ok = await submitAnswer({ selectedOption: index });
    if (!ok) setCurrentSelection(previousSelection);
  };

  if (quizEnded) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-6 font-sans relative selection:bg-indigo-100">
        {/* Ambient orbs */}
        <div className="orb orb-violet w-[300px] h-[300px] top-1/4 left-1/4 opacity-10" />
        <div className="orb orb-coral w-[200px] h-[200px] bottom-1/4 right-1/4 opacity-10" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full bg-white rounded-3xl p-10 text-center shadow-sm border border-gray-200 space-y-6 relative z-10 hover-card"
        >
          <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-sm">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase">
              Session Concluded
            </span>
            <h1 className="font-heading text-4xl font-bold text-gray-900 mt-1">
              Quiz Completed!
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Thank you for participating, <span className="font-semibold text-gray-900">{participantName}</span>.
              {myResult
                ? ` You scored ${myResult.score} point${myResult.score === 1 ? '' : 's'} (rank ${myResult.rank} of ${myResult.totalParticipants}).`
                : ' Your responses were recorded.'}
            </p>
          </div>

          <div className="pt-4">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl gradient-btn text-white font-medium text-sm transition-all shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Home</span>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-6 font-sans relative selection:bg-indigo-100">
      {/* Ambient glow */}
      <div className="orb orb-violet w-[300px] h-[300px] top-0 right-0 opacity-10" />

      {/* Participant Top Header */}
      <div className="fixed top-6 left-6 right-6 max-w-xl mx-auto flex items-center justify-between px-6 py-3 rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200 shadow-sm z-20">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span className="font-heading font-bold text-sm text-gray-900">QuizPulse</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span
            className="flex items-center gap-1.5 text-gray-500"
            title={connected ? t('live.connected') : t('live.reconnecting')}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
              aria-hidden="true"
            />
            <span className="sr-only">{connected ? t('live.connected') : t('live.reconnecting')}</span>
          </span>
          {queued > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold tabular-nums">
              {queued} queued
            </span>
          )}
          <LanguagePicker compact />
          <span className="text-gray-500 hidden sm:inline">
            {t('live.player')}: <strong className="text-gray-900">{participantName}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-mono font-bold border border-indigo-100">
            {roomCode}
          </span>
        </div>
      </div>

      <main className="max-w-xl w-full pt-16 relative z-10">
        {qaEnabled && (
          <div className="flex gap-1.5 mb-4 p-1 bg-white/80 backdrop-blur rounded-2xl border border-gray-200">
            {(['poll', 'qa'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  tab === key ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {key === 'poll' ? t('live.tabPoll') : t('live.tabQa')}
              </button>
            ))}
          </div>
        )}

        {tab === 'qa' && qaEnabled ? (
          <div className="bg-white rounded-3xl p-6 md:p-7 shadow-sm border border-gray-200">
            <QaPanel />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {results ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl p-8 md:p-10 shadow-sm border border-gray-200 space-y-5"
              >
                <span className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase">
                  {t('live.results')}
                </span>
                <QuestionResults tally={results} revealCorrect />
              </motion.div>
            ) : !activeQuestion ? (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl p-10 text-center shadow-sm border border-gray-200 space-y-6 hover-card"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
                <div className="space-y-2">
                  <span className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase">
                    {t('live.ready')}
                  </span>
                  <h1 className="font-heading text-3xl md:text-4xl font-bold text-gray-900">
                    {t('live.waitingTitle')}, {participantName}!
                  </h1>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    {t('live.waitingBody')}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={activeQuestion.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl p-8 md:p-10 shadow-sm border border-gray-200 space-y-6"
              >
                <div>
                  <span className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase">
                    {t('live.activeQuestion')}
                  </span>
                  <h2 className="font-heading text-3xl font-bold text-gray-900 mt-1 leading-snug">
                    {activeQuestion.text}
                  </h2>
                </div>

                {/* The deadline is enforced server-side; this is the clock that
                    was previously enforced against but never displayed. */}
                <Countdown
                  startedAt={startedAt}
                  timeLimit={activeQuestion.timeLimit}
                  onExpire={() => setExpired(true)}
                />

                {expired && (
                  <p className="text-sm font-semibold text-rose-600 text-center">
                    {t('live.timeUpMessage')}
                  </p>
                )}

                <fieldset disabled={expired} className="space-y-3.5 pt-2 disabled:opacity-60">
                  {(activeQuestion.type === 'OPEN_TEXT' || activeQuestion.type === 'WORD_CLOUD') && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitAnswer({ answerText: textAnswer });
                      }}
                      className="space-y-3"
                    >
                      <textarea
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        rows={3}
                        maxLength={280}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 outline-none focus:border-indigo-500"
                        placeholder={activeQuestion.type === 'WORD_CLOUD' ? t('live.wordPlaceholder') : t('live.textPlaceholder')}
                      />
                      <button type="submit" disabled={!textAnswer.trim()} className="w-full gradient-btn text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                        {submitted ? t('live.updateAnswer') : t('live.submitAnswer')}
                      </button>
                    </form>
                  )}

                  {activeQuestion.type === 'RANKING' && (
                    <>
                      <p className="text-xs text-gray-500">
                        Put these in your preferred order — most important first.
                      </p>
                      {ranking.map((optionIndex, position) => (
                        <div
                          key={optionIndex}
                          className="w-full p-3.5 rounded-2xl border border-gray-200 bg-white flex items-center gap-3"
                        >
                          <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 tabular-nums">
                            {position + 1}
                          </span>
                          <span className="flex-1 text-left text-gray-800">
                            {activeQuestion.options[optionIndex]}
                          </span>
                          <span className="flex flex-col gap-1">
                            <button
                              type="button"
                              aria-label="Move up"
                              disabled={position === 0}
                              onClick={() =>
                                setRanking((prev) => {
                                  const next = [...prev];
                                  const above = next[position - 1]!;
                                  next[position - 1] = next[position]!;
                                  next[position] = above;
                                  return next;
                                })
                              }
                              className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label="Move down"
                              disabled={position === ranking.length - 1}
                              onClick={() =>
                                setRanking((prev) => {
                                  const next = [...prev];
                                  const below = next[position + 1]!;
                                  next[position + 1] = next[position]!;
                                  next[position] = below;
                                  return next;
                                })
                              }
                              className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </span>
                        </div>
                      ))}
                      <button
                        onClick={() => submitAnswer({ rankedOptions: ranking })}
                        className="w-full gradient-btn text-white py-3 rounded-xl font-semibold"
                      >
                        {submitted ? t('live.updateSelection') : t('live.submitSelection')}
                      </button>
                    </>
                  )}

                  {activeQuestion.type === 'MULTI_SELECT' && (
                    <>
                      {(activeQuestion.options || []).map((opt: string, idx: number) => {
                        const isSelected = multiSelection.includes(idx);
                        return (
                          <button
                            key={idx}
                            onClick={() =>
                              setMultiSelection((prev) =>
                                prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                              )
                            }
                            className={`w-full p-4.5 rounded-2xl text-left font-medium text-base transition-all flex items-center justify-between border ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                                : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            <span>{opt}</span>
                            {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => submitAnswer({ selectedOptions: multiSelection })}
                        disabled={multiSelection.length === 0}
                        className="w-full gradient-btn text-white py-3 rounded-xl font-semibold disabled:opacity-50"
                      >
                        {submitted ? t('live.updateSelection') : t('live.submitSelection')}
                      </button>
                    </>
                  )}

                  {(!activeQuestion.type || activeQuestion.type === 'MCQ' || activeQuestion.type === 'RATING') &&
                    (activeQuestion.options || []).map((opt: string, idx: number) => {
                    const isSelected = currentSelection === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => submitMcq(idx)}
                        className={`w-full p-4.5 rounded-2xl text-left font-medium text-base transition-all flex items-center justify-between border ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-sm font-semibold'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <span
                            className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {['A', 'B', 'C', 'D', 'E', 'F'][idx] || idx + 1}
                          </span>
                          <span>{opt}</span>
                        </div>

                        {isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                        )}
                      </button>
                    );
                  })}
                </fieldset>

                {submitted && !expired && (
                  <div className="pt-2 text-center">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('live.recorded')}</span>
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
};

export default LiveQuiz;
