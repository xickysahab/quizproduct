import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Square, ChevronRight, ChevronLeft, Users, BarChart3, Radio, Award, LogOut, QrCode, X, Eye, MessageSquare, Monitor, Trophy, ListOrdered } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Logo from '../components/Logo';
import { socket, connectSocket } from '../socket/socket';
import api from '../services/api';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';
import QuestionResults from '../components/QuestionResults';
import QaModerationPanel from '../components/QaModerationPanel';
import Countdown from '../components/Countdown';
import ShareRoom from '../components/ShareRoom';
import OptionTile from '../components/OptionTile';
import RoomPin from '../components/RoomPin';
import LivePodium from '../components/LivePodium';
import type { EventDetail, EventSummary, LeaderboardRow, QuestionTally } from '../types/analytics';
import { themeFor } from '../utils/sessionTheme';

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
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [podiumOpen, setPodiumOpen] = useState(false);

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

  // Colour temperature follows the session's personality.
  const themeMode = themeFor(event);

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

      socket.on('host:podium', (data: { leaderboard?: LeaderboardRow[] }) => {
        setLeaderboard(data.leaderboard || []);
        setPodiumOpen(true);
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
      socket.off('host:podium');
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
      setPodiumOpen(false);
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
    setPodiumOpen(false);
    setQuestionStartedAt(new Date().toISOString());
    socket.emit('host:nextQuestion', id, event.questions[prevIndex]);
  };

  /**
   * The between-question beat. Not a readout — a pause with a purpose: the room
   * looks up, sees who moved, reacts, and the host gets a moment to talk.
   */
  const toggleScoreboard = () => {
    if (scoreboardOpen) {
      socket.emit('host:hideScoreboard', id);
      setScoreboardOpen(false);
      return;
    }
    socket.emit('host:showScoreboard', id);
    setScoreboardOpen(true);
  };

  const handleRevealResults = () => {
    if (!activeQuestionIdRef.current) return;
    socket.emit('host:revealResults', id, activeQuestionIdRef.current);
    setRevealed(true);
  };

  const handleShowPodium = () => {
    if (!id) return;
    socket.emit('host:showPodium', id);
    setPodiumOpen(true);
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
      <div data-mode={themeMode} className="min-h-screen bg-live-stage text-white flex items-center justify-center font-heading text-lg">
        Opening the live stage…
      </div>
    );
  }

  if (!event || !event.questions || event.questions.length === 0) {
    return (
      <div data-mode={themeMode} className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-6 text-center space-y-4">
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
    <div data-mode={themeMode} className="min-h-screen flex flex-col bg-live-stage text-white font-sans relative">
      {/* Header Bar */}
      <header className="bg-black/25 px-6 md:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Logo size={36} />
          <div>
            <h1 className="font-heading text-xl font-bold text-white">{event.title}</h1>
            <div className="flex items-center gap-3 text-xs text-white/55">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>{participantCount} Joined</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Live Broadcast</span>
              </span>
              <span>•</span>
              <span
                className={`px-2 py-0.5 rounded-full font-semibold ${
                  event.sessionMode === 'SURVEY'
                    ? 'bg-teal-400/15 text-teal-200 border border-teal-400/30'
                    : 'bg-indigo-400/15 text-accent-lift border border-indigo-400/30'
                }`}
              >
                {event.sessionMode === 'SURVEY' ? 'Survey' : 'Quiz'}
              </span>
            </div>
          </div>
        </div>

        {/* PIN Badge */}
        <div className="text-right flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.open(`/host/display/${id}`, '_blank', 'noopener,noreferrer')}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all flex items-center gap-2 border border-white/15"
            title="Open a projector-friendly audience screen"
          >
            <Monitor className="w-3.5 h-3.5" />
            Audience screen
          </button>
          <RoomPin code={event.roomCode} tone="dark" />
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
                    <span className="text-lg font-bold text-accent bg-accent-wash px-4 py-1.5 rounded-full border border-accent-soft tabular-nums">
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
                        ranking: [],
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
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                        Question {index + 1}
                      </span>
                      <div className="mt-2">
                        <QuestionResults
                          tally={tally}
                          palette={brandPalette}
                          revealCorrect={event.sessionMode !== 'SURVEY'}
                        />
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
              <div className="space-y-6">
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-accent-lift">
                  Lobby
                </span>
                <h2 className="font-heading text-4xl md:text-6xl font-bold text-white">
                  {participantCount === 0 ? 'Waiting for the room…' : `${participantCount} in the room`}
                </h2>

                <RoomPin code={event.roomCode} size="hero" tone="dark" />
                
                {!showQR ? (
                  <div className="flex flex-col items-center gap-4 mt-2">
                    <p className="text-base text-white/55 max-w-lg mx-auto">
                      Show this PIN on the projector — people join from any phone, no app.
                    </p>
                    <div className="pt-1">
                      <ShareRoom roomCode={event.roomCode} title={event.title} />
                    </div>
                    <button
                      onClick={() => setShowQR(true)}
                      className="text-sm font-semibold text-white flex items-center gap-2 hover:bg-white/15 transition-colors bg-white/10 px-4 py-2 rounded-full border border-white/15"
                    >
                      <QrCode className="w-4 h-4" />
                      Show QR Code
                    </button>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-4 mt-2 bg-white text-slate-950 p-6 rounded-3xl max-w-xs mx-auto relative"
                  >
                    <button
                      onClick={() => setShowQR(false)}
                      className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <span className="text-xs font-bold uppercase tracking-widest text-accent">Scan to Join</span>
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <QRCodeSVG 
                        value={`${window.location.origin}/?code=${event.roomCode}`} 
                        size={180}
                        fgColor="#111827"
                        level="H"
                      />
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="pt-4">
                <button
                  onClick={handleNextQuestion}
                  className="px-10 py-5 rounded-2xl gradient-btn text-white font-heading text-2xl font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-1 inline-flex items-center gap-3"
                >
                  <Play className="w-6 h-6 fill-current text-white" />
                  <span>{event.sessionMode === 'SURVEY' ? 'Begin survey' : 'Begin quiz'}</span>
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
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-lift">
                  Question {currentQuestionIndex + 1} of {event.questions.length}
                </span>

                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/10 text-xs font-medium text-white/80">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>
                    {responsesCount} / {participantCount} answers
                  </span>
                </div>
              </div>

              <h2 className="font-heading text-4xl md:text-5xl font-bold text-white leading-tight">
                {activeQuestion.text}
              </h2>

              {activeQuestion.timeLimit ? (
                <div className="max-w-sm">
                  <Countdown startedAt={questionStartedAt} timeLimit={activeQuestion.timeLimit} tone="dark" />
                </div>
              ) : null}

              <div className={liveResults ? 'bg-white text-slate-900 rounded-3xl p-5' : ''}>
                {liveResults ? (
                  <QuestionResults
                    tally={liveResults}
                    palette={brandPalette}
                    revealCorrect={revealed && event.sessionMode !== 'SURVEY'}
                    compact
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(activeQuestion.options || []).map((opt: string, idx: number) => (
                      <OptionTile key={idx} index={idx} label={opt} size="stage" />
                    ))}
                    {(activeQuestion.options || []).length === 0 && (
                      <p className="text-sm text-white/50">Waiting for the first response…</p>
                    )}
                  </div>
                )}
              </div>

              {showQa && id && <QaModerationPanel eventId={id} />}
              {event.sessionMode !== 'SURVEY' && leaderboard.length > 0 && (
                <div className="bg-white/8 border border-white/10 rounded-2xl p-5 text-left">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-3">Live leaderboard</h3>
                  <LivePodium rows={leaderboard} tone="dark" size={podiumOpen ? 'stage' : 'mini'} />
                </div>
              )}
            </motion.div>
          ) : null}
        </div>
      </main>

      {/* Control Footer */}
      <footer className="bg-black/30 px-6 md:px-8 py-5 flex justify-between items-center border-t border-white/10 backdrop-blur-md">
        <button
          onClick={handleEndQuiz}
          className="px-5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 text-xs font-semibold transition-all flex items-center gap-2 border border-rose-400/20"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>{showFinalSummary ? 'Exit cockpit' : event.sessionMode === 'SURVEY' ? 'End survey' : 'End quiz'}</span>
        </button>

        {!showFinalSummary && (
          <button
            onClick={() => setShowQa((v) => !v)}
            className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
              showQa
                ? 'bg-white text-slate-950 border-white'
                : 'bg-white/8 hover:bg-white/12 border-white/15 text-white/80'
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
            {event.sessionMode !== 'SURVEY' && (
              <button
                onClick={handleShowPodium}
                title="Put the leaderboard on phones and the audience screen"
                className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Show podium</span>
              </button>
            )}

            {event.scoringEnabled !== false && (
              <button
                onClick={toggleScoreboard}
                title="Put the standings on the big screen"
                className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                  scoreboardOpen
                    ? 'bg-accent border-accent text-white'
                    : 'btn-quiet'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>{scoreboardOpen ? 'Hide standings' : 'Standings'}</span>
              </button>
            )}

            <button
              onClick={handleRevealResults}
              disabled={revealed}
              title="Show the distribution to everyone in the room"
              className="px-5 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/15 text-white/80 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{revealed ? 'Results shown' : 'Show results'}</span>
            </button>

            <button
              onClick={handlePrevQuestion}
              disabled={currentQuestionIndex === 0}
              className="px-5 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/15 text-white/80 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
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
        title={
          confirmModal.action === 'conclude'
            ? event.sessionMode === 'SURVEY'
              ? 'Conclude Survey'
              : 'Conclude Quiz'
            : 'Exit Broadcast'
        }
        message={
          confirmModal.action === 'conclude'
            ? event.sessionMode === 'SURVEY'
              ? 'End the survey and show the response summary to the room?'
              : 'Are you sure you want to conclude the live quiz and display final analytics?'
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
