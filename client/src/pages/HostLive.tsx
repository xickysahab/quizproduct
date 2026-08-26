import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Square, ChevronRight, ChevronLeft, BarChart3, Award, LogOut, QrCode, Eye, MessageSquare, Monitor, Trophy, ListOrdered } from 'lucide-react';
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
import type { EventDetail, EventSummary, LeaderboardRow, QuestionTally } from '../types/analytics';
import { themeFor, themeLabel } from '../utils/sessionTheme';
import { formatRoomCode } from '../utils/roomCode';

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


  // Socket handlers are registered once, so they read the live question through
  // a ref rather than closing over a stale render's state.
  const activeQuestionIdRef = useRef<string | null>(null);

  // Colour temperature follows the session's personality.
  const themeMode = themeFor(event);

  // Declared before the effect that runs it, and memoised so it can sit in the
  // dependency array honestly. Previously the effect referenced a const that was
  // still being initialised, and omitted it from its deps — which happens to
  // work today only because effects run after the component body.
  const fetchEventDetails = useCallback(async () => {
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

        // Hydrate the live state too, not just which question is up. The
        // cockpit is often reopened mid-session — on a refresh, or on a second
        // laptop — and until now that showed no timer and zero answers until
        // the next socket event happened to arrive.
        setQuestionStartedAt(loaded.currentQuestionStartedAt ?? null);

        if (loaded.currentQuestionId) {
          api
            .get(`/analytics/questions/${loaded.currentQuestionId}`)
            .then((tally) => setResponsesCount(tally.data.totalResponses ?? 0))
            .catch(() => undefined);
        }
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
  }, [id, navigate]);

  useEffect(() => {
    void fetchEventDetails();
  }, [fetchEventDetails]);

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
      <div data-mode={themeMode} className="min-h-screen bg-paper grid place-items-center">
        <span className="eyebrow">Opening the cockpit…</span>
      </div>
    );
  }

  if (!event || !event.questions || event.questions.length === 0) {
    return (
      <div data-mode={themeMode} className="min-h-screen bg-paper grid place-items-center p-6">
        <div className="card p-8 text-center max-w-sm">
          <p className="font-heading text-xl font-semibold mb-2">Nothing to run yet</p>
          <p className="text-sm text-muted mb-6">
            This session has no questions. Add a few and come back.
          </p>
          <button
            onClick={() => navigate(`/events/${id}`)}
            className="btn-primary w-full py-3 rounded-xl"
          >
            Add questions
          </button>
        </div>
      </div>
    );
  }

  const activeQuestion = currentQuestionIndex >= 0 ? event.questions[currentQuestionIndex] : null;
  const isFinished = currentQuestionIndex >= event.questions.length - 1;
  const total = event.questions.length;
  const scored = event.scoringEnabled !== false;
  const answeredPct =
    participantCount > 0 ? Math.min(100, Math.round((responsesCount / participantCount) * 100)) : 0;
  const nextQuestion =
    currentQuestionIndex + 1 < total ? event.questions[currentQuestionIndex + 1] : null;

  /* ---------------------------------------------------------------------
     The cockpit.

     Deliberately not a second projector: the big screen is already showing the
     room what it needs, and duplicating it here wastes the one surface where
     the host can see what the audience cannot. So this is dense on purpose —
     what is on screen now, what is coming next, how many have answered, and
     what needs reviewing — with the controls pinned to the bottom where a hand
     already is.
  --------------------------------------------------------------------- */
  return (
    <div data-mode={themeMode} className="min-h-screen bg-paper flex flex-col">

      {/* ---- top rail ---- */}
      <header className="border-b border-line bg-surface/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 py-3 flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Logo size={30} />
            <div className="min-w-0">
              <h1 className="font-heading text-base font-semibold truncate">{event.title}</h1>
              <p className="text-xs text-muted flex items-center gap-1.5">
                <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-accent" />
                Live
                <span className="text-faint">· {themeLabel(themeMode)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <Stat label="In the room" value={participantCount} />
            {activeQuestion && <Stat label="Answered" value={responsesCount} accent />}

            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.15em] text-faint">Code</p>
              <p className="code-display text-lg text-accent">{formatRoomCode(event.roomCode)}</p>
            </div>

            <button
              onClick={() => window.open(`/host/display/${id}`, '_blank', 'noopener')}
              title="Open a projector-friendly audience screen"
              className="btn-quiet px-3 py-2 rounded-lg text-xs flex items-center gap-1.5"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Big screen</span>
            </button>
          </div>
        </div>

        {/* One thin line of progress across the whole session. */}
        <div className="h-0.5 bg-line">
          <div
            className="h-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${total ? ((currentQuestionIndex + 1) / total) * 100 : 0}%` }}
          />
        </div>
      </header>

      {/* ---- body ---- */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-5 lg:px-8 py-6 pb-28">
        {showFinalSummary && summaryData ? (
          <FinalSummary summary={summaryData} scored={scored} />
        ) : currentQuestionIndex === -1 ? (
          /* ---- lobby ---- */
          <div className="max-w-3xl mx-auto text-center pt-10 animate-rise">
            <p className="eyebrow mb-3">Waiting to start</p>
            <h2 className="font-heading text-3xl md:text-4xl font-bold mb-3">
              {participantCount === 0
                ? 'Nobody has joined yet'
                : `${participantCount} ${participantCount === 1 ? 'person is' : 'people are'} in`}
            </h2>
            <p className="text-muted mb-8">
              Put the big screen up so the room can see the code, then start when you are ready.
            </p>

            <div className="card p-6 inline-block mb-8">
              <RoomPin code={event.roomCode} />
              <div className="mt-5 flex flex-col items-center gap-4">
                <ShareRoom roomCode={event.roomCode} title={event.title} />
                <button
                  onClick={() => setShowQR((v) => !v)}
                  className="text-xs font-semibold text-accent hover:underline flex items-center gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {showQR ? 'Hide QR code' : 'Show QR code'}
                </button>
                {showQR && (
                  <div className="p-3 bg-white rounded-xl border border-line animate-rise">
                    <QRCodeSVG
                      value={`${window.location.origin}/?code=${event.roomCode}`}
                      size={140}
                      fgColor="#14100E"
                      level="M"
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <button
                onClick={handleNextQuestion}
                className="btn-primary px-8 py-4 rounded-2xl text-base inline-flex items-center gap-2.5"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start · {total} question{total === 1 ? '' : 's'}</span>
              </button>
            </div>
          </div>
        ) : activeQuestion ? (
          /* ---- running ---- */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
            <div className="space-y-5">
              <div className="card card-live p-6 animate-cut-in" key={activeQuestion.id}>
                <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                  <span className="eyebrow">
                    On screen now · {currentQuestionIndex + 1} of {total}
                  </span>
                  {activeQuestion.timeLimit && questionStartedAt && (
                    <div className="w-40">
                      <Countdown
                        startedAt={questionStartedAt}
                        timeLimit={activeQuestion.timeLimit}
                      />
                    </div>
                  )}
                </div>

                <h2 className="font-heading text-2xl md:text-3xl font-bold leading-snug mb-5">
                  {activeQuestion.text}
                </h2>

                {/* The host sees the answer key. The room does not, until a
                    reveal — that boundary is enforced on the server. */}
                {liveResults ? (
                  <QuestionResults tally={liveResults} revealCorrect={scored} compact />
                ) : activeQuestion.options?.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeQuestion.options.map((option, index) => (
                      <OptionTile
                        key={index}
                        index={index}
                        label={option}
                        as="div"
                        selected={scored && isKeyed(activeQuestion, index)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Open response — answers appear as they land.</p>
                )}

                <div className="mt-5 pt-4 border-t border-line-soft flex items-center gap-3">
                  <span className="font-mono text-sm tabular text-ink">
                    {responsesCount}
                    <span className="text-faint"> / {participantCount}</span>
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                      style={{ width: `${answeredPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-faint whitespace-nowrap">answered</span>
                </div>
              </div>

              {/* What the host is about to put up. Reading it before pressing
                  Next is the difference between a smooth room and a stumble. */}
              {nextQuestion && (
                <div className="card p-4 opacity-70 hover:opacity-100 transition-opacity">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-faint mb-1">
                    Up next · {currentQuestionIndex + 2} of {total}
                  </p>
                  <p className="text-sm text-ink-soft leading-snug">{nextQuestion.text}</p>
                </div>
              )}
            </div>

            {/* ---- side rail ---- */}
            <aside className="space-y-4 lg:sticky lg:top-24">
              {scored && leaderboard.length > 0 && (
                <div className="card p-4">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-faint mb-3">
                    Leading
                  </p>
                  <ol className="space-y-1.5">
                    {leaderboard.slice(0, 5).map((row) => (
                      <li key={row.participantId} className="flex items-center gap-2.5 text-sm">
                        <span className="font-mono text-xs tabular text-faint w-4">{row.rank}</span>
                        <span className="flex-1 truncate">{row.name || 'Anonymous'}</span>
                        <span className="font-mono tabular text-accent">{row.score}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {showQa && id ? (
                <QaModerationPanel eventId={id} />
              ) : (
                event.qaEnabled !== false && (
                  <button
                    onClick={() => setShowQa(true)}
                    className="card p-4 w-full text-left hover-card"
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Audience questions</span>
                      {qaPending > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-[color:var(--color-caution-wash)] text-[color:var(--color-caution)] text-[11px] font-bold tabular">
                          {qaPending} to review
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted mt-1">
                      {qaPending > 0 ? 'Somebody is waiting on you.' : 'Open the queue'}
                    </span>
                  </button>
                )
              )}
            </aside>
          </div>
        ) : null}
      </main>

      {/* ---- control bar ----
          Pinned, because during a live session the host's hand is already here
          and hunting for a button mid-room is how a session stumbles. */}
      {!showFinalSummary && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/95 backdrop-blur-sm">
          <div className="max-w-[1400px] mx-auto px-5 lg:px-8 py-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={handleEndQuiz}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-[color:var(--color-wrong)]/25 bg-[color:var(--color-wrong-wash)] text-[color:var(--color-wrong)] flex items-center gap-1.5"
            >
              <Square className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">End session</span>
            </button>

            {event.qaEnabled !== false && (
              <button
                onClick={() => setShowQa((v) => !v)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${
                  showQa ? 'bg-accent border-accent text-white' : 'btn-quiet'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Questions</span>
                {qaPending > 0 && (
                  <span className="px-1.5 rounded bg-[color:var(--color-caution)] text-white text-[10px] tabular">
                    {qaPending}
                  </span>
                )}
              </button>
            )}

            <div className="flex-1" />

            {currentQuestionIndex !== -1 && (
              <>
                {scored && (
                  <button
                    onClick={toggleScoreboard}
                    title="Put the standings on the big screen"
                    className={`px-4 py-2.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${
                      scoreboardOpen ? 'bg-accent border-accent text-white' : 'btn-quiet'
                    }`}
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">
                      {scoreboardOpen ? 'Hide standings' : 'Standings'}
                    </span>
                  </button>
                )}

                <button
                  onClick={handleRevealResults}
                  disabled={revealed}
                  title="Show the distribution to everyone in the room"
                  className="btn-quiet px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{revealed ? 'Results shown' : 'Show results'}</span>
                </button>

                <button
                  onClick={handlePrevQuestion}
                  disabled={currentQuestionIndex === 0}
                  className="btn-quiet px-3 py-2.5 rounded-xl text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden lg:inline">Back</span>
                </button>

                {isFinished ? (
                  <>
                    {scored && event.podiumAtEnd !== false && (
                      <button
                        onClick={handleShowPodium}
                        disabled={podiumOpen}
                        className="btn-quiet px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Podium</span>
                      </button>
                    )}
                    <button
                      onClick={handleFinishAndViewSummary}
                      className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>Finish</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.action === 'conclude' ? 'Finish the session?' : 'Leave the cockpit?'}
        message={
          confirmModal.action === 'conclude'
            ? 'The room stops here and everyone sees the final results.'
            : 'The session ends for everyone in the room.'
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

/** Does this option carry the answer key? Host-only — never sent to the room. */
const isKeyed = (question: { correctOption?: number | null; correctOptions?: number[] }, index: number): boolean => {
  if (question.correctOptions?.length) return question.correctOptions.includes(index);
  return question.correctOption === index;
};

const Stat: React.FC<{ label: string; value: number; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="text-right hidden sm:block">
    <p className="text-[10px] uppercase tracking-[0.15em] text-faint">{label}</p>
    <p className={`font-mono text-lg tabular ${accent ? 'text-accent' : 'text-ink'}`}>{value}</p>
  </div>
);

const FinalSummary: React.FC<{ summary: EventSummary; scored: boolean }> = ({ summary, scored }) => (
  <div className="animate-rise">
    <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
      <div>
        <p className="eyebrow mb-1">Session complete</p>
        <h2 className="font-heading text-3xl font-bold">{summary.title}</h2>
      </div>
      <p className="text-sm text-muted">
        <span className="font-mono text-2xl tabular text-ink">{summary.totalParticipants}</span>{' '}
        took part
      </p>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {summary.questions.map((tally, index) => (
        <div key={tally.id} className="card p-5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-faint mb-2">
            Question {index + 1}
          </p>
          <QuestionResults tally={tally} revealCorrect={scored} />
        </div>
      ))}
    </div>
  </div>
);

export default HostLive;
