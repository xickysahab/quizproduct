import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Logo from '../components/Logo';
import { socket, connectSocket } from '../socket/socket';
import api from '../services/api';
import QuestionResults from '../components/QuestionResults';
import OptionTile from '../components/OptionTile';
import LivePodium from '../components/LivePodium';
import type { EventDetail, LeaderboardRow, QuestionTally } from '../types/analytics';

/** A standings row plus how far it moved since the last scoreboard. */
type ScoreboardRow = LeaderboardRow & { movement?: number | null; previousRank?: number | null };
import { themeFor } from '../utils/sessionTheme';
import { formatRoomCode } from '../utils/roomCode';

/**
 * Projector / secondary-screen view — question + live tally only.
 * Host controls stay on /host/live/:id so the laptop can run the room
 * while the big screen stays clean for the audience.
 */
const AudienceDisplay: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [participantCount, setParticipantCount] = useState(0);
  const [responsesCount, setResponsesCount] = useState(0);
  const [liveResults, setLiveResults] = useState<QuestionTally | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [ended, setEnded] = useState(false);
  const [finalResults, setFinalResults] = useState<QuestionTally[]>([]);
  const [podiumOpen, setPodiumOpen] = useState(false);
  // The between-question beat. Null means it is not currently on screen.
  const [scoreboard, setScoreboard] = useState<ScoreboardRow[] | null>(null);

  const activeQuestionIdRef = useRef<string | null>(null);

  // Colour temperature follows the session's personality.
  const themeMode = themeFor(event);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const response = await api.get(`/events/${id}`);
        if (cancelled) return;
        const loaded = response.data.event as EventDetail;
        setEvent(loaded);
        setParticipantCount(loaded._count?.participants || 0);

        if (loaded.isLive && loaded.currentQuestionId) {
          const resumeIndex = (loaded.questions || []).findIndex(
            (q: { id: string }) => q.id === loaded.currentQuestionId
          );
          if (resumeIndex >= 0) setCurrentQuestionIndex(resumeIndex);

          // Hydrate the live state, not just the question. A projector is
          // routinely opened after a question has already started, and until
          // now that showed no timer and zero answers until the next socket
          // event happened to arrive.
          setQuestionStartedAt(loaded.currentQuestionStartedAt ?? null);

          try {
            const tally = await api.get(`/analytics/questions/${loaded.currentQuestionId}`);
            if (!cancelled) setResponsesCount(tally.data.totalResponses ?? 0);
          } catch {
            /* the counter catches up on the next answer */
          }
        }

        connectSocket();

        const handleConnect = () => socket.emit('host:join', id);
        socket.on('connect', handleConnect);
        if (socket.connected) handleConnect();

        socket.on('host:participantCount', (data: { count: number }) => {
          setParticipantCount(data.count);
        });

        socket.on('host:responseCount', (data: { questionId: string; count: number }) => {
          setResponsesCount((prev) =>
            data.questionId === activeQuestionIdRef.current ? data.count : prev
          );
        });

        socket.on('host:liveResults', (tally: QuestionTally) => setLiveResults(tally));

        socket.on('host:leaderboard', (data: { leaderboard: LeaderboardRow[] }) => {
          setLeaderboard(data.leaderboard || []);
        });

        // The scoreboard beat: a deliberate pause showing who moved. The
        // server sends it only when the host asks for one.
        socket.on('host:scoreboard', (data: { standings?: ScoreboardRow[] }) => {
          setScoreboard(data.standings || []);
        });

        socket.on('host:scoreboardClosed', () => setScoreboard(null));

        socket.on('host:podium', (data: { leaderboard?: LeaderboardRow[] }) => {
          setScoreboard(null);
          setLeaderboard(data.leaderboard || []);
          setPodiumOpen(true);
        });

        socket.on('host:questionActive', (data: { startedAt: string; question?: { id: string } }) => {
          setQuestionStartedAt(data.startedAt);
          setLiveResults(null);
          setRevealed(false);
          setResponsesCount(0);
          setEnded(false);
          setPodiumOpen(false);
          setScoreboard(null);

          if (data.question?.id && loaded.questions) {
            const idx = loaded.questions.findIndex((q) => q.id === data.question!.id);
            if (idx >= 0) setCurrentQuestionIndex(idx);
          }
        });

        socket.on('host:resultsRevealed', (tally: QuestionTally) => {
          setLiveResults(tally);
          setRevealed(true);
        });

        socket.on(
          'host:quizEnded',
          (payload?: {
            questions?: QuestionTally[];
            totalParticipants?: number;
            leaderboard?: LeaderboardRow[];
          }) => {
            setEnded(true);
            setPodiumOpen(false);
            if (payload?.questions?.length) {
              setFinalResults(payload.questions);
            }
            if (payload?.leaderboard?.length) {
              setLeaderboard(payload.leaderboard);
            }
            if (typeof payload?.totalParticipants === 'number') {
              setParticipantCount(payload.totalParticipants);
            }
          }
        );
      } catch {
        navigate('/dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void boot();

    return () => {
      cancelled = true;
      socket.off('connect');
      socket.off('host:participantCount');
      socket.off('host:responseCount');
      socket.off('host:liveResults');
      socket.off('host:leaderboard');
      socket.off('host:podium');
      socket.off('host:scoreboard');
      socket.off('host:scoreboardClosed');
      socket.off('host:questionActive');
      socket.off('host:resultsRevealed');
      socket.off('host:quizEnded');
      socket.disconnect();
    };
  }, [id, navigate]);

  useEffect(() => {
    const question = event?.questions?.[currentQuestionIndex];
    activeQuestionIdRef.current = question?.id ?? null;
  }, [currentQuestionIndex, event]);

  // Follow the controlling host window: when it advances, it re-emits
  // host:nextQuestion which fans out as host:questionActive. As a fallback,
  // poll the event pointer occasionally so a late-opened display catches up.
  useEffect(() => {
    if (!id || !event) return;
    const tick = async () => {
      try {
        const res = await api.get(`/events/${id}`);
        const loaded = res.data.event as EventDetail;
        setParticipantCount(loaded._count?.participants || 0);
        if (!loaded.isLive) {
          if (currentQuestionIndex >= 0) setEnded(true);
          return;
        }
        if (loaded.currentQuestionId) {
          const idx = (loaded.questions || []).findIndex((q) => q.id === loaded.currentQuestionId);
          if (idx >= 0 && idx !== currentQuestionIndex) {
            setCurrentQuestionIndex(idx);
            setLiveResults(null);
            setRevealed(false);
            setQuestionStartedAt(loaded.currentQuestionStartedAt || new Date().toISOString());

            try {
              const tally = await api.get(`/analytics/questions/${loaded.currentQuestionId}`);
              setResponsesCount(tally.data.totalResponses ?? 0);
            } catch {
              setResponsesCount(0);
            }
          }
        }
      } catch {
        /* display stays on last known frame */
      }
    };
    const interval = window.setInterval(tick, 4000);
    return () => window.clearInterval(interval);
  }, [id, event, currentQuestionIndex]);

  const activeQuestion =
    currentQuestionIndex >= 0 ? event?.questions?.[currentQuestionIndex] : null;

  const total = event?.questions?.length ?? 0;
  const answeredPct =
    participantCount > 0 ? Math.min(100, Math.round((responsesCount / participantCount) * 100)) : 0;

  if (loading || !event) {
    return (
      <div data-mode="discussion" className="stage min-h-screen grid place-items-center">
        <span className="eyebrow">Preparing the room…</span>
      </div>
    );
  }

  /* ---------------------------------------------------------------------
     The projected screen.

     Designed to be read from the back of a room rather than from a desk:
     nothing under ~18px, no thin strokes, no low-contrast greys, and the
     single most useful thing on screen at any moment is also the largest.
     Host controls deliberately live on /host/live/:id — the big screen stays
     clean for the audience.
  --------------------------------------------------------------------- */
  return (
    <div data-mode={themeMode} className="stage min-h-screen flex flex-col relative overflow-hidden">
      <div className="stage-grid" aria-hidden="true" />

      {/* The timer runs edge to edge along the very top. At forty feet a number
          is unreadable but a draining bar is not, so the bar is the timer and
          the number is only a courtesy. */}
      {activeQuestion?.timeLimit && questionStartedAt && !revealed && !ended && !podiumOpen && (
        <StageTimer startedAt={questionStartedAt} timeLimit={activeQuestion.timeLimit} />
      )}

      {/* ---- header rail ---- */}
      <header className="relative z-10 flex items-center justify-between gap-6 px-8 lg:px-12 py-5">
        <div className="flex items-center gap-3 min-w-0">
          <Logo size={30} />
          <div className="min-w-0">
            <p className="font-heading text-lg font-semibold truncate text-[color:var(--color-stage-ink)]">
              {event.title}
            </p>
            <p className="text-xs text-[color:var(--color-stage-muted)] flex items-center gap-2">
              <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--accent-lift)]" />
              Live
              {total > 0 && currentQuestionIndex >= 0 && (
                <span className="tabular">
                  · Question {currentQuestionIndex + 1} of {total}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-stage-muted)]">
              In the room
            </p>
            <p className="font-mono text-2xl font-medium tabular text-[color:var(--color-stage-ink)]">
              {participantCount}
            </p>
          </div>

          {/* The code never leaves the screen — people arrive late. */}
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-stage-muted)]">
              Join at quizpulse · code
            </p>
            <p className="code-display text-2xl text-[color:var(--accent-lift)]">
              {formatRoomCode(event.roomCode)}
            </p>
          </div>
        </div>
      </header>

      {/* ---- stage ---- */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-8 lg:px-16 pb-10">

        {/* 1. Podium ------------------------------------------------------ */}
        {podiumOpen && !ended ? (
          <div className="w-full max-w-5xl animate-rise">
            <p className="eyebrow text-center mb-6">Final standings</p>
            <LivePodium rows={leaderboard} tone="dark" size="stage" />
          </div>

        /* 2. Scoreboard beat -------------------------------------------- */
        ) : scoreboard ? (
          <div className="w-full max-w-4xl animate-cut-in">
            <p className="eyebrow text-center mb-8">Standings</p>
            <ol className="space-y-2.5">
              {scoreboard.map((row, i) => (
                <li
                  key={row.participantId}
                  className="flex items-center gap-5 px-6 py-4 rounded-2xl bg-[color:var(--color-stage-2)] border border-[color:var(--color-stage-3)]"
                  style={{ animation: `rise-in var(--dur-base) var(--ease-out-soft) ${i * 55}ms both` }}
                >
                  <span className="font-mono text-2xl tabular w-12 text-[color:var(--color-stage-muted)]">
                    {row.rank}
                  </span>

                  {/* Movement is the whole reason this screen exists — a list
                      of positions is a readout, a list of changes is a moment. */}
                  <Movement value={row.movement} />

                  <span className="flex-1 min-w-0 truncate text-2xl lg:text-3xl font-medium text-[color:var(--color-stage-ink)]">
                    {row.name || 'Anonymous'}
                  </span>
                  <span className="font-mono text-2xl lg:text-3xl tabular text-[color:var(--accent-lift)]">
                    {row.score}
                  </span>
                </li>
              ))}
            </ol>
          </div>

        /* 3. Session over ------------------------------------------------ */
        ) : ended ? (
          <div className="w-full max-w-6xl animate-rise">
            <p className="eyebrow text-center mb-2">That's a wrap</p>
            <h2 className="font-heading text-4xl lg:text-5xl font-bold text-center mb-10 text-[color:var(--color-stage-ink)]">
              {event.scoringEnabled === false ? 'Thanks for taking part' : 'Thanks for playing'}
            </h2>

            {event.scoringEnabled !== false && leaderboard.length > 0 && (
              <div className="mb-10">
                <LivePodium rows={leaderboard} tone="dark" size="stage" />
              </div>
            )}

            {finalResults.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-h-[46vh] overflow-y-auto pr-1">
                {finalResults.map((tally, i) => (
                  <div
                    key={tally.id}
                    className="rounded-2xl bg-[color:var(--color-stage-2)] border border-[color:var(--color-stage-3)] p-5"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-stage-muted)] mb-2">
                      Question {i + 1}
                    </p>
                    <QuestionResults tally={tally} revealCorrect={event.scoringEnabled !== false} />
                  </div>
                ))}
              </div>
            )}
          </div>

        /* 4. Lobby ------------------------------------------------------- */
        ) : currentQuestionIndex < 0 ? (
          <div className="w-full max-w-5xl text-center">
            <p className="eyebrow mb-5">Join now</p>

            {/* The single largest thing on the screen, because for these two
                minutes it is the only thing anybody needs. */}
            <p className="code-display leading-none whitespace-nowrap text-[color:var(--color-stage-ink)]
                          text-[clamp(3rem,9.5vw,9rem)] mb-8">
              {formatRoomCode(event.roomCode)}
            </p>

            <div className="flex flex-col md:flex-row items-center justify-center gap-10">
              <div className="p-4 rounded-2xl bg-white join-pulse">
                <QRCodeSVG
                  value={`${window.location.origin}/?code=${event.roomCode}`}
                  size={168}
                  fgColor="#14100E"
                  level="M"
                />
              </div>

              <div className="text-left max-w-xs">
                <p className="text-2xl font-medium text-[color:var(--color-stage-ink)] mb-2">
                  Scan, or go to this site and enter the code.
                </p>
                <p className="text-lg text-[color:var(--color-stage-muted)]">
                  {participantCount === 0
                    ? 'Waiting for the first person…'
                    : `${participantCount} ${participantCount === 1 ? 'person is' : 'people are'} in.`}
                </p>
              </div>
            </div>
          </div>

        /* 5. A question is live ------------------------------------------ */
        ) : activeQuestion ? (
          <div key={activeQuestion.id} className="w-full max-w-6xl animate-cut-in">
            <h2 className="font-heading font-bold leading-[1.08] text-center mx-auto mb-10
                           text-[clamp(2rem,4.6vw,4.25rem)] max-w-5xl text-[color:var(--color-stage-ink)]">
              {activeQuestion.text}
            </h2>

            {revealed && liveResults ? (
              <div className="max-w-4xl mx-auto rounded-3xl bg-[color:var(--color-stage-2)] border border-[color:var(--color-stage-3)] p-8">
                <QuestionResults
                  tally={liveResults}
                  revealCorrect={event.scoringEnabled !== false}
                  compact
                />
              </div>
            ) : activeQuestion.options?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5 stagger">
                {activeQuestion.options.map((option, index) => (
                  <OptionTile key={index} index={index} label={option} size="stage" as="div" />
                ))}
              </div>
            ) : (
              <p className="text-center text-2xl text-[color:var(--color-stage-muted)]">
                Answering on your phone…
              </p>
            )}
          </div>
        ) : null}
      </main>

      {/* ---- answer counter ----
          Bottom rail, because the host reads it constantly to decide when to
          move on, and the room reads it to know whether it is waiting on them. */}
      {activeQuestion && !ended && !podiumOpen && !scoreboard && (
        <footer className="relative z-10 px-8 lg:px-12 pb-6">
          <div className="flex items-center gap-4">
            <span className="font-mono text-xl tabular text-[color:var(--color-stage-ink)]">
              {responsesCount}
              <span className="text-[color:var(--color-stage-muted)]"> / {participantCount}</span>
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-[color:var(--color-stage-3)] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${answeredPct}%`, background: 'var(--accent-lift)' }}
              />
            </div>
            <span className="text-sm text-[color:var(--color-stage-muted)] whitespace-nowrap">
              answered
            </span>
          </div>
        </footer>
      )}
    </div>
  );
};

/**
 * The timer, as a bar the full width of the screen.
 *
 * Runs off the server's `startedAt` rather than a local clock, so the projector
 * and every phone in the room agree. Turns red and tightens for the last five
 * seconds — legible in peripheral vision, which is where a room's attention
 * actually is once they have started answering.
 */
const StageTimer: React.FC<{ startedAt: string; timeLimit: number }> = ({ startedAt, timeLimit }) => {
  const [remaining, setRemaining] = useState(timeLimit);

  useEffect(() => {
    const deadline = new Date(startedAt).getTime() + timeLimit * 1000;
    const tick = () => setRemaining(Math.max(0, (deadline - Date.now()) / 1000));
    tick();
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [startedAt, timeLimit]);

  const fraction = Math.max(0, Math.min(1, remaining / timeLimit));
  const urgent = remaining <= 5 && remaining > 0;

  return (
    <div className="absolute top-0 left-0 right-0 z-20" aria-hidden="true">
      <div className="h-1.5 w-full bg-[color:var(--color-stage-3)]">
        <div
          className="h-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${fraction * 100}%`,
            background: urgent ? 'var(--color-wrong)' : 'var(--accent-lift)',
          }}
        />
      </div>
      {/* Centred under the bar: the header has the logo on the left and the
          room stats on the right, so the middle is the only place a large
          number does not collide with something people need. */}
      <span
        className={`absolute left-1/2 -translate-x-1/2 top-3 font-mono text-4xl tabular leading-none ${
          urgent ? 'timer-urgent' : ''
        }`}
        style={{ color: urgent ? 'var(--color-wrong)' : 'var(--color-stage-muted)' }}
      >
        {Math.ceil(remaining)}
      </span>
    </div>
  );
};

/** Rank change since the previous scoreboard. Null on the first one. */
const Movement: React.FC<{ value?: number | null }> = ({ value }) => {
  if (!value) {
    return <span className="w-10 text-center text-[color:var(--color-stage-3)] text-xl">–</span>;
  }
  const up = value > 0;
  return (
    <span
      className="w-10 text-center font-mono text-lg tabular"
      style={{ color: up ? 'var(--color-right)' : 'var(--color-wrong)' }}
      title={up ? `Up ${value}` : `Down ${Math.abs(value)}`}
    >
      {up ? '▲' : '▼'}
      {Math.abs(value)}
    </span>
  );
};

export default AudienceDisplay;
