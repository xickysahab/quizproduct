import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Square, ChevronRight, ChevronLeft, Users, BarChart3, Radio, Award, LogOut, QrCode, X, Eye, MessageSquare } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Logo from '../components/Logo';
import { socket, connectSocket } from '../socket/socket';
import api from '../services/api';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';
import QuestionResults from '../components/QuestionResults';
import QaModerationPanel from '../components/QaModerationPanel';
import Countdown from '../components/Countdown';
import type { EventDetail, EventSummary, LeaderboardRow, QuestionTally } from '../types/analytics';

const HostLive: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, action: 'conclude' | 'exit' | null}>({ isOpen: false, action: null });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [participantCount, setParticipantCount] = useState(0);
  const [responsesCount, setResponsesCount] = useState(0);

  const [showFinalSummary, setShowFinalSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<EventSummary | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [liveResults, setLiveResults] = useState<QuestionTally | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showQa, setShowQa] = useState(false);
  const [qaPending, setQaPending] = useState(0);

  // The conclude config's colours still theme the charts. Its option *labels*
  // no longer label anything — results are labelled from each question's own
  // options — so a mismatched palette is simply ignored rather than applied to
  // the wrong number of bars.
  const brandPalette = event?.concludeConfig?.options?.length
    ? event.concludeConfig.options.map((option) => option.themeColor)
    : undefined;

  // Socket handlers are registered once, so they read the live question through
  // a ref rather than closing over a stale render's state.
  const activeQuestionIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetchEventDetails();
  }, [id]);

  const fetchEventDetails = async () => {
    try {
      const response = await api.get(`/events/${id}`);
      const loaded = response.data.event;
      setEvent(loaded);
      setParticipantCount(loaded._count?.participants || 0);

      // Pick the live session back up where the server says it is. Without
      // this a refresh mid-quiz dropped the host back to the lobby while
      // participants were still on question 7.
      if (loaded.isLive && loaded.currentQuestionId) {
        const resumeIndex = (loaded.questions || []).findIndex(
          (q: { id: string }) => q.id === loaded.currentQuestionId
        );
        if (resumeIndex >= 0) setCurrentQuestionIndex(resumeIndex);
      }

      // Connect socket with auth token so the server can authorize host actions
      connectSocket();

      // Rejoin the host room on every connection, not just the first — a
      // reconnect otherwise leaves the host silently outside the room.
      const handleConnect = () => socket.emit('host:join', id);
      socket.on('connect', handleConnect);
      if (socket.connected) handleConnect();

      // Both counters are now absolute values computed by the server, not
      // deltas accumulated here. A rejoin or a host reconnect no longer drifts
      // the numbers, and they cannot be moved by a participant.
      socket.on('host:participantCount', (data: { count: number }) => {
        setParticipantCount(data.count);
      });

      socket.on('host:responseCount', (data: { questionId: string; count: number }) => {
        setResponsesCount((prev) =>
          data.questionId === activeQuestionIdRef.current ? data.count : prev
        );
      });

      // The distribution fills in as answers land — host-only, so the room is
      // not biased by seeing the tally before they answer.
      socket.on('host:liveResults', (tally: QuestionTally) => setLiveResults(tally));

      // Pushed by the server once a second while answers are landing, instead
      // of the client re-fetching the full leaderboard on every batch.
      socket.on('host:leaderboard', (data: { leaderboard: LeaderboardRow[] }) => {
        setLeaderboard(data.leaderboard || []);
      });

      socket.on('host:questionActive', (data: { startedAt: string }) => {
        setQuestionStartedAt(data.startedAt);
      });

      // Badge the Questions button so a host running a poll still notices
      // something is waiting for review.
      socket.on('qa:updated', () => {
        api
          .get(`/questions-from-audience/event/${id}`)
          .then((res) => {
            const pending = (res.data.questions || []).filter(
              (q: { status: string }) => q.status === 'PENDING'
            );
            setQaPending(pending.length);
          })
          .catch(() => undefined);
      });

      socket.on('host:unauthorized', (data: { message: string }) => {
        toast.error(data.message || 'Not authorized to host this event.');
      });
    } catch (error) {
      console.error('Failed to fetch event', error);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      socket.off('connect');
      socket.off('host:participantCount');
      socket.off('host:responseCount');
      socket.off('host:liveResults');
      socket.off('host:leaderboard');
      socket.off('host:questionActive');
      socket.off('qa:updated');
      socket.off('host:unauthorized');
      socket.disconnect();
    };
  }, []);

  // Keep the ref aligned with the rendered question, and refresh the
  // leaderboard once per question instead of on every incoming response batch.
  useEffect(() => {
    const question = event?.questions?.[currentQuestionIndex];
    activeQuestionIdRef.current = question?.id ?? null;

  }, [currentQuestionIndex, event]);

  const handleNextQuestion = () => {
    if (!event) return;
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < event.questions.length) {
      setCurrentQuestionIndex(nextIndex);
      setResponsesCount(0);
      setLiveResults(null);
      setRevealed(false);
      setQuestionStartedAt(new Date().toISOString());
      socket.emit('host:nextQuestion', id, event.questions[nextIndex]);
    }
  };

  const handlePrevQuestion = () => {
    if (!event || currentQuestionIndex <= 0) return;
    const prevIndex = currentQuestionIndex - 1;
    setCurrentQuestionIndex(prevIndex);
    setResponsesCount(0);
    setLiveResults(null);
    setRevealed(false);
    setQuestionStartedAt(new Date().toISOString());
    socket.emit('host:nextQuestion', id, event.questions[prevIndex]);
  };

  const handleRevealResults = () => {
    if (!activeQuestionIdRef.current) return;
    socket.emit('host:revealResults', id, activeQuestionIdRef.current);
    setRevealed(true);
  };

  const handleFinishAndViewSummary = async () => {
    setConfirmModal({ isOpen: true, action: 'conclude' });
  };

  const executeConclude = async () => {
    socket.emit('host:endQuiz', id);

    try {
      const res = await api.get(`/analytics/events/${id}/summary`);
      setSummaryData(res.data);
      setShowFinalSummary(true);
    } catch (err) {
      console.error('Failed to load summary analytics', err);
      toast.error('Failed to load results summary.');
    }
  };

  const handleEndQuiz = () => {
    if (!showFinalSummary) {
      setConfirmModal({ isOpen: true, action: 'exit' });
      return;
    }
    executeExit();
  };

  const executeExit = () => {
    if (!showFinalSummary) socket.emit('host:endQuiz', id);
    navigate(`/dashboard`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center font-heading text-lg">
        Initializing live broadcast stage...
      </div>
    );
  }

  if (!event || !event.questions || event.questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <p className="font-heading text-2xl">No questions configured for this event.</p>
        <button
          onClick={() => navigate(`/events/${id}`)}
          className="px-6 py-3 rounded-2xl gradient-btn text-white font-medium shadow-sm"
        >
          Add Questions First
        </button>
      </div>
    );
  }

  const activeQuestion = currentQuestionIndex >= 0 ? event.questions[currentQuestionIndex] : null;
  const isFinished = currentQuestionIndex >= event.questions.length - 1;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 font-sans relative selection:bg-indigo-100">
      {/* Header Bar */}
      <header className="bg-white px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Logo size={36} />
          <div>
            <h1 className="font-heading text-xl font-bold text-gray-900">{event.title}</h1>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>{participantCount} Joined</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                <span>Live Broadcast</span>
              </span>
            </div>
          </div>
        </div>

        {/* PIN Badge */}
        <div className="text-right flex items-center gap-4">
          <div className="bg-gray-50 px-5 py-2 rounded-2xl border border-gray-200 text-center shadow-sm">
            <span className="text-[10px] tracking-[0.2em] uppercase text-indigo-600 font-bold block">
              Join Code
            </span>
            <span className="font-mono text-3xl font-bold tracking-[0.2em] text-gray-900">
              {event.roomCode}
            </span>
          </div>
        </div>
      </header>

      {/* Stage Main View */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 text-center w-full flex items-center justify-center">
        <div className="max-w-4xl mx-auto w-full h-full flex items-center justify-center">
          {showFinalSummary && summaryData ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-left w-full"
            >
              <div className="w-full space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover-card gap-4">
                  <div>
                    <h3 className="font-heading text-2xl md:text-3xl font-bold text-gray-900">
                      {summaryData.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">Final results</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                      Participants
                    </span>
                    <span className="text-lg font-bold text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-100 tabular-nums">
                      {summaryData.totalParticipants}
                    </span>
                  </div>
                </div>

                {/* Pooled view, shown only when every question shares one scale.
                    The server returns null otherwise — averaging unlike questions
                    produced a chart with borrowed labels and no meaning. */}
                {summaryData.collective && (
                  <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-200 shadow-sm">
                    <h4 className="font-heading text-xl font-bold text-gray-900 mb-1">
                      Across all questions
                    </h4>
                    <p className="text-xs text-gray-500 mb-5">
                      Every question uses the same scale, so responses are pooled.
                    </p>
                    <QuestionResults
                      compact
                      tally={{
                        id: 'collective',
                        text: 'Across all questions',
                        type: 'MCQ',
                        options: summaryData.collective.optionsText,
                        totalResponses: summaryData.collective.totalResponses,
                        optionCounts: summaryData.collective.optionCounts,
                        percentages: summaryData.collective.percentages,
                        textAnswers: [],
                        words: [],
                      }}
                      palette={brandPalette}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {summaryData.questions.map((tally, index) => (
                    <div
                      key={tally.id}
                      className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">
                        Question {index + 1}
                      </span>
                      <div className="mt-2">
                        <QuestionResults tally={tally} palette={brandPalette} revealCorrect />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : currentQuestionIndex === -1 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 text-center"
            >
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-600">
                  Lobby Stage
                </span>
                <h2 className="font-heading text-4xl md:text-6xl font-bold text-gray-900">
                  Waiting for participants to join...
                </h2>
                
                {!showQR ? (
                  <div className="flex flex-col items-center gap-4 mt-4">
                    <p className="text-base text-gray-500 max-w-lg mx-auto font-light">
                      Ask your audience to go to the landing page and enter room PIN{' '}
                      <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                        {event.roomCode}
                      </span>
                    </p>
                    <button
                      onClick={() => setShowQR(true)}
                      className="text-sm font-semibold text-indigo-600 flex items-center gap-2 hover:text-indigo-800 transition-colors bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100"
                    >
                      <QrCode className="w-4 h-4" />
                      Show QR Code
                    </button>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-4 mt-6 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm max-w-xs mx-auto relative hover-card"
                  >
                    <button
                      onClick={() => setShowQR(false)}
                      className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Scan to Join</span>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <QRCodeSVG 
                        value={`${window.location.origin}/?code=${event.roomCode}`} 
                        size={180}
                        fgColor="#111827"
                        level="H"
                      />
                    </div>
                    <span className="font-mono text-2xl font-bold tracking-[0.2em] text-gray-900">
                      {event.roomCode}
                    </span>
                  </motion.div>
                )}
              </div>

              <div className="pt-4">
                <button
                  onClick={handleNextQuestion}
                  className="px-10 py-5 rounded-2xl gradient-btn text-white font-heading text-2xl font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-1 inline-flex items-center gap-3"
                >
                  <Play className="w-6 h-6 fill-current text-white" />
                  <span>Begin Quiz Broadcast</span>
                </button>
              </div>
            </motion.div>
          ) : activeQuestion ? (
            <motion.div
              key={currentQuestionIndex}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 text-left"
            >
              {/* Question Index & Live Response Count */}
              <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
                  Question {currentQuestionIndex + 1} of {event.questions.length}
                </span>

                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-gray-200 text-xs font-medium text-gray-600 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>
                    {responsesCount} / {participantCount} Submissions
                  </span>
                </div>
              </div>

              {/* Title */}
              <h2 className="font-heading text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
                {activeQuestion.text}
              </h2>

              {activeQuestion.timeLimit ? (
                <div className="max-w-sm">
                  <Countdown startedAt={questionStartedAt} timeLimit={activeQuestion.timeLimit} />
                </div>
              ) : null}

              {/* Live distribution, filling in as answers land. */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                {liveResults ? (
                  <QuestionResults
                    tally={liveResults}
                    palette={brandPalette}
                    revealCorrect={revealed}
                    compact
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(activeQuestion.options || []).map((opt: string, idx: number) => (
                      <div
                        key={idx}
                        className="border border-gray-200 rounded-2xl p-5 flex items-center gap-4"
                      >
                        <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 font-heading text-lg font-bold flex items-center justify-center border border-indigo-100">
                          {['A', 'B', 'C', 'D', 'E', 'F'][idx] || idx + 1}
                        </span>
                        <span className="text-lg font-medium text-gray-700">{opt}</span>
                      </div>
                    ))}
                    {(activeQuestion.options || []).length === 0 && (
                      <p className="text-sm text-gray-500">Waiting for the first response…</p>
                    )}
                  </div>
                )}
              </div>

              {showQa && id && <QaModerationPanel eventId={id} />}
              {leaderboard.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Live leaderboard</h3>
                  <ol className="space-y-2">
                    {leaderboard.map((row) => (
                      <li key={row.participantId} className="flex justify-between text-sm">
                        <span>{row.rank}. {row.name}</span>
                        <span className="font-bold text-indigo-600">{row.score}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </motion.div>
          ) : null}
        </div>
      </main>

      {/* Control Footer */}
      <footer className="bg-white px-8 py-5 flex justify-between items-center border-t border-gray-200 shadow-sm">
        <button
          onClick={handleEndQuiz}
          className="px-5 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition-all flex items-center gap-2 border border-red-100"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>{showFinalSummary ? 'Exit Cockpit' : 'End Live Quiz'}</span>
        </button>

        {!showFinalSummary && (
          <button
            onClick={() => setShowQa((v) => !v)}
            className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
              showQa
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Questions</span>
            {qaPending > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 text-[10px] tabular-nums">
                {qaPending}
              </span>
            )}
          </button>
        )}

        {!showFinalSummary && currentQuestionIndex !== -1 && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleRevealResults}
              disabled={revealed}
              title="Show the distribution to everyone in the room"
              className="px-5 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{revealed ? 'Results shown' : 'Show results'}</span>
            </button>

            <button
              onClick={handlePrevQuestion}
              disabled={currentQuestionIndex === 0}
              className="px-5 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            {isFinished ? (
              <button
                onClick={handleFinishAndViewSummary}
                className="px-7 py-3 rounded-2xl gradient-btn text-white font-semibold text-sm transition-all shadow-sm hover:shadow-md flex items-center gap-2"
              >
              <span>Conclude & Show Results</span>
              <BarChart3 className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleNextQuestion}
                className="px-7 py-3 rounded-2xl gradient-btn text-white hover:opacity-90 font-semibold text-sm transition-all shadow-sm hover:shadow-md flex items-center gap-2"
              >
              <span>Next Question</span>
              <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </footer>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.action === 'conclude' ? 'Conclude Quiz' : 'Exit Broadcast'}
        message={
          confirmModal.action === 'conclude'
            ? 'Are you sure you want to conclude the live quiz and display final analytics?'
            : 'Are you sure you want to exit the broadcast?'
        }
        icon={confirmModal.action === 'conclude' ? <Award className="w-7 h-7" /> : <LogOut className="w-7 h-7" />}
        onConfirm={() => {
          if (confirmModal.action === 'conclude') executeConclude();
          else if (confirmModal.action === 'exit') executeExit();
        }}
        onCancel={() => setConfirmModal({ isOpen: false, action: null })}
        isDestructive={confirmModal.action === 'exit'}
      />
    </div>
  );
};

export default HostLive;
