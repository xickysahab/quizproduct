import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, Award, ArrowLeft } from 'lucide-react';
import OptionTile from '../components/OptionTile';
import LivePodium from '../components/LivePodium';
import toast from 'react-hot-toast';
import BrandedHeader from '../components/BrandedHeader';
import { socket, connectAsParticipant } from '../socket/socket';
import api from '../services/api';
import type { LeaderboardRow, LiveQuestion, QuestionTally } from '../types/analytics';
import Countdown from '../components/Countdown';
import QaPanel from '../components/QaPanel';
import QuestionResults from '../components/QuestionResults';
import LanguagePicker from '../components/LanguagePicker';
import { useTranslation } from '../i18n/useTranslation';
import { enqueue, flushQueue, onQueueChange, pendingCount, startAutoFlush } from '../utils/answerQueue';
import { readRoomBranding, brandTint, type RoomBranding } from '../utils/branding';
import { motion, AnimatePresence } from 'framer-motion';

const LiveQuiz: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [participantName, setParticipantName] = useState<string | null>(null);
  const [branding, setBranding] = useState<RoomBranding | null>(null);
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
  const [sessionMode, setSessionMode] = useState<'QUIZ' | 'SURVEY'>('QUIZ');
  const [queued, setQueued] = useState(0);
  const [myResult, setMyResult] = useState<{ score: number; rank: number; totalParticipants: number } | null>(null);
  const [sessionResults, setSessionResults] = useState<{
    title?: string;
    totalParticipants: number;
    questions: QuestionTally[];
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    scored: boolean;
    isCorrect: boolean | null;
    score: number;
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [standing, setStanding] = useState<{
    rank: number;
    score: number;
    totalParticipants: number;
  } | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [showPodium, setShowPodium] = useState(false);

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
    setMeId(pId);
    setQaEnabled(localStorage.getItem('qaEnabled') !== 'false');
    setSessionMode(localStorage.getItem('sessionMode') === 'SURVEY' ? 'SURVEY' : 'QUIZ');
    setBranding(readRoomBranding());

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
        setFeedback(null);
        setShowPodium(false);
        setTab('poll');
      }
    );

    // The host decides when the room sees the distribution.
    socket.on('participant:results', (payload) => setResults(payload));

    socket.on('participant:leaderboard', (data: { leaderboard?: LeaderboardRow[] }) => {
      setLeaderboard(data.leaderboard || []);
    });

    socket.on('participant:podium', (data: { leaderboard?: LeaderboardRow[] }) => {
      setLeaderboard(data.leaderboard || []);
      setShowPodium(true);
    });

    socket.on(
      'participant:quizEnded',
      async (payload?: {
        title?: string;
        sessionMode?: string;
        totalParticipants?: number;
        questions?: QuestionTally[];
        leaderboard?: LeaderboardRow[];
      }) => {
        setQuizEnded(true);
        setActiveQuestion(null);
        if (payload?.sessionMode === 'SURVEY') setSessionMode('SURVEY');
        if (payload?.leaderboard?.length) setLeaderboard(payload.leaderboard);

        if (payload?.questions?.length) {
          setSessionResults({
            title: payload.title,
            totalParticipants: payload.totalParticipants || 0,
            questions: payload.questions,
          });
        } else {
          // Reconnect / missed payload — pull the same charts over HTTP.
          try {
            const res = await api.get('/participants/results');
            setSessionResults({
              title: res.data.title,
              totalParticipants: res.data.totalParticipants || 0,
              questions: res.data.questions || [],
            });
            if (res.data.leaderboard?.length) setLeaderboard(res.data.leaderboard);
            if (res.data.sessionMode === 'SURVEY') setSessionMode('SURVEY');
          } catch {
            /* charts optional */
          }
        }

        if (localStorage.getItem('sessionMode') !== 'SURVEY' && payload?.sessionMode !== 'SURVEY') {
          try {
            const res = await api.get('/participants/me');
            setMyResult(res.data);
          } catch {
            /* score is optional */
          }
        }
      }
    );

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
      socket.off('participant:leaderboard');
      socket.off('participant:podium');
      socket.off('participant:quizEnded');
      socket.off('participant:unauthorized');
      socket.disconnect();
    };
  }, [navigate]);

  const submitAnswer = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!activeQuestion) return false;

    try {
      const res = await api.post('/participants/response', {
        questionId: activeQuestion.id,
        ...payload,
      });
      // The host's counter is driven by the server from accepted responses —
      // the client no longer nudges it, because that was spammable.
      setSubmitted(true);
      setFeedback({
        scored: Boolean(res.data?.scored),
        isCorrect: res.data?.isCorrect ?? null,
        score: Number(res.data?.score) || 0,
      });
      if (res.data?.standing) setStanding(res.data.standing);
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
        setFeedback(null);
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

  const accent = branding?.primaryColor || undefined;

  if (quizEnded) {
    return (
      <div className="min-h-screen bg-live-stage text-white flex flex-col items-center justify-center p-6 font-sans relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className={`w-full bg-white text-gray-900 rounded-[2rem] p-8 md:p-10 text-center shadow-2xl space-y-6 relative z-10 ${
            sessionResults?.questions?.length ? 'max-w-2xl' : 'max-w-md'
          }`}
        >
          <div
            className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-sm"
            style={accent ? { backgroundColor: brandTint(accent, 0.15), color: accent } : undefined}
          >
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="w-10 h-10 object-contain" />
            ) : (
              <Award className="w-8 h-8" />
            )}
          </div>
          <div>
            <span
              className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase"
              style={accent ? { color: accent } : undefined}
            >
              {branding?.name || 'Session Concluded'}
            </span>
            <h1 className="font-heading text-4xl font-bold text-gray-900 mt-1">
              {sessionMode === 'SURVEY' ? 'Survey complete' : 'Quiz Completed!'}
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Thank you for participating, <span className="font-semibold text-gray-900">{participantName}</span>.
              {sessionMode === 'SURVEY'
                ? sessionResults?.questions?.length
                  ? ` Here’s how the room answered (${sessionResults.totalParticipants} participants).`
                  : ' Your responses were recorded.'
                : myResult
                  ? ` You scored ${myResult.score} point${myResult.score === 1 ? '' : 's'} (rank ${myResult.rank} of ${myResult.totalParticipants}).`
                  : ' Your responses were recorded.'}
            </p>
          </div>

          {sessionMode === 'QUIZ' && (leaderboard.length > 0 || standing) && (
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600 mb-3">
                Leaderboard
              </p>
              <LivePodium rows={leaderboard} meId={meId} standing={standing || myResult} size="stage" />
            </div>
          )}

          {sessionResults?.questions && sessionResults.questions.length > 0 && (
            <div className="text-left space-y-5 pt-2 max-h-[55vh] overflow-y-auto pr-1">
              {sessionResults.questions.map((tally, index) => (
                <div
                  key={tally.id}
                  className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 md:p-5"
                >
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">
                    {sessionMode === 'SURVEY' ? 'Question' : 'Q'} {index + 1}
                  </span>
                  <div className="mt-2">
                    <QuestionResults tally={tally} revealCorrect={false} compact />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl gradient-btn text-white font-medium text-sm transition-all shadow-sm hover:shadow-md"
              style={accent ? { background: accent } : undefined}
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
    <div className="min-h-screen bg-live-stage text-white flex flex-col items-center justify-center p-4 md:p-6 font-sans relative">
      {/* Participant Top Header */}
      <div className="fixed top-4 left-4 right-4 max-w-xl mx-auto z-20">
        <BrandedHeader
          branding={branding}
          tone="stage"
          trailing={
            <>
              <span
                className="flex items-center gap-1.5 text-white/60"
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
              <LanguagePicker compact tone="dark" />
              <span className="text-white/50 hidden sm:inline">
                {t('live.player')}: <strong className="text-white">{participantName}</strong>
              </span>
              {sessionMode === 'QUIZ' && standing && (
                <span className="px-2.5 py-1 rounded-full bg-amber-400 text-amber-950 font-heading font-bold tabular-nums">
                  #{standing.rank}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-white font-heading font-bold tracking-widest border border-white/15">
                {roomCode}
              </span>
            </>
          }
        />
      </div>

      {showPodium && sessionMode === 'QUIZ' && (
        <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-5">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-slate-950 border border-white/10 rounded-[2rem] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Podium</p>
                <h2 className="font-heading text-2xl font-bold">Race so far</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPodium(false)}
                className="text-xs font-semibold text-white/60 hover:text-white"
              >
                Back to quiz
              </button>
            </div>
            <LivePodium rows={leaderboard} meId={meId} standing={standing} tone="dark" size="stage" />
          </motion.div>
        </div>
      )}

      <main className="max-w-xl w-full pt-16 relative z-10">
        {qaEnabled && (
          <div className="flex gap-1.5 mb-4 p-1 bg-white/8 backdrop-blur rounded-2xl border border-white/10">
            {(['poll', 'qa'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  tab === key ? 'bg-white text-slate-950' : 'text-white/70 hover:bg-white/8'
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
                className="bg-white text-gray-900 rounded-[2rem] p-8 md:p-10 shadow-2xl space-y-5"
              >
                <span className="text-[11px] font-bold tracking-[0.2em] text-indigo-600 uppercase">
                  {t('live.results')}
                </span>
                <QuestionResults tally={results} revealCorrect={sessionMode !== 'SURVEY'} />
              </motion.div>
            ) : !activeQuestion ? (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white/8 border border-white/12 rounded-[2rem] p-10 text-center space-y-6 backdrop-blur-md"
              >
                <div className="w-20 h-20 rounded-full bg-white text-slate-950 flex items-center justify-center mx-auto join-pulse">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
                <div className="space-y-2">
                  <span className="text-[11px] font-bold tracking-[0.28em] text-indigo-300 uppercase">
                    {t('live.ready')}
                  </span>
                  <h1 className="font-heading text-3xl md:text-5xl font-bold text-white">
                    {t('live.waitingTitle')}, {participantName}!
                  </h1>
                  <p className="text-sm text-white/55 max-w-sm mx-auto">
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
                className="space-y-5"
              >
                <div className="bg-white/8 border border-white/10 rounded-[1.6rem] p-6 md:p-7">
                  <span className="text-[11px] font-bold tracking-[0.22em] text-indigo-300 uppercase">
                    {t('live.activeQuestion')}
                  </span>
                  <h2 className="font-heading text-2xl md:text-3xl font-bold text-white mt-1.5 leading-snug">
                    {activeQuestion.text}
                  </h2>
                  <div className="mt-5">
                    <Countdown
                      startedAt={startedAt}
                      timeLimit={activeQuestion.timeLimit}
                      onExpire={() => setExpired(true)}
                      tone="dark"
                    />
                  </div>
                </div>

                {expired && (
                  <p className="text-sm font-semibold text-rose-300 text-center">
                    {t('live.timeUpMessage')}
                  </p>
                )}

                <fieldset disabled={expired} className="space-y-3 pt-0.5 disabled:opacity-60">
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
                      <div
                        className={`grid gap-3 ${
                          (activeQuestion.options || []).length >= 3 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                        }`}
                      >
                        {(activeQuestion.options || []).map((opt: string, idx: number) => (
                          <OptionTile
                            key={idx}
                            index={idx}
                            label={opt}
                            selected={multiSelection.includes(idx)}
                            onClick={() =>
                              setMultiSelection((prev) =>
                                prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                              )
                            }
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => submitAnswer({ selectedOptions: multiSelection })}
                        disabled={multiSelection.length === 0}
                        className="w-full gradient-btn text-white py-3.5 rounded-2xl font-semibold disabled:opacity-50"
                      >
                        {submitted ? t('live.updateSelection') : t('live.submitSelection')}
                      </button>
                    </>
                  )}

                  {(!activeQuestion.type || activeQuestion.type === 'MCQ' || activeQuestion.type === 'RATING') && (
                    <div
                      className={`grid gap-3 ${
                        (activeQuestion.options || []).length >= 3 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                      }`}
                    >
                      {(activeQuestion.options || []).map((opt: string, idx: number) => (
                        <OptionTile
                          key={idx}
                          index={idx}
                          label={opt}
                          selected={currentSelection === idx}
                          dimmed={submitted && currentSelection !== idx}
                          onClick={() => submitMcq(idx)}
                        />
                      ))}
                    </div>
                  )}
                </fieldset>

                {submitted && !expired && (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={
                        feedback?.scored
                          ? feedback.isCorrect
                            ? 'correct'
                            : 'wrong'
                          : 'recorded'
                      }
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="pt-2 text-center"
                    >
                      {feedback?.scored && feedback.isCorrect ? (
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800 bg-emerald-50 px-5 py-2.5 rounded-2xl border border-emerald-200 shadow-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            {t('live.correct')}
                            {feedback.score > 0 ? ` · +${feedback.score}` : ''}
                          </span>
                        </span>
                      ) : feedback?.scored ? (
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-rose-800 bg-rose-50 px-5 py-2.5 rounded-2xl border border-rose-200 shadow-sm">
                          <span className="w-4 h-4 rounded-full border-2 border-rose-500 inline-flex items-center justify-center text-[10px] leading-none">
                            ×
                          </span>
                          <span>{t('live.incorrect')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('live.recorded')}</span>
                        </span>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}

                {sessionMode === 'QUIZ' && submitted && (leaderboard.length > 0 || standing) && (
                  <div className="bg-white/8 border border-white/10 rounded-[1.4rem] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300 mb-3">
                      Live leaderboard
                    </p>
                    <LivePodium
                      rows={leaderboard}
                      meId={meId}
                      standing={standing}
                      tone="dark"
                      size="mini"
                    />
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
