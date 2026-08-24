import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Radio, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Logo from '../components/Logo';
import { socket, connectSocket } from '../socket/socket';
import api from '../services/api';
import QuestionResults from '../components/QuestionResults';
import Countdown from '../components/Countdown';
import OptionTile from '../components/OptionTile';
import RoomPin from '../components/RoomPin';
import LivePodium from '../components/LivePodium';
import type { EventDetail, LeaderboardRow, QuestionTally } from '../types/analytics';
import { themeFor } from '../utils/sessionTheme';

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

        socket.on('host:podium', (data: { leaderboard?: LeaderboardRow[] }) => {
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
            setResponsesCount(0);
            setQuestionStartedAt(loaded.currentQuestionStartedAt || new Date().toISOString());
          }
        }
      } catch {
        /* display stays on last known frame */
      }
    };
    const interval = window.setInterval(tick, 4000);
    return () => window.clearInterval(interval);
  }, [id, event, currentQuestionIndex]);

  if (loading) {
    return (
      <div data-mode={themeMode} className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-heading text-lg">
        Opening audience display…
      </div>
    );
  }

  if (!event) return null;

  const brandPalette = event.concludeConfig?.options?.length
    ? event.concludeConfig.options.map((option: { themeColor: string }) => option.themeColor)
    : undefined;

  const activeQuestion = currentQuestionIndex >= 0 ? event.questions[currentQuestionIndex] : null;


  return (
    <div data-mode={themeMode} className="min-h-screen flex flex-col bg-live-stage text-white font-sans">
      <header className="px-8 py-5 flex justify-between items-center border-b border-white/10">
        <div className="flex items-center gap-4">
          <Logo size={40} />
          <div>
            <h1 className="font-heading text-2xl font-bold">{event.title}</h1>
            <div className="flex items-center gap-3 text-sm text-white/60">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                {participantCount} joined
              </span>
              <span className="flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                Audience display
              </span>
            </div>
          </div>
        </div>
        <RoomPin code={event.roomCode} tone="dark" />
      </header>

      <main className="flex-1 flex items-center justify-center p-8">
        {podiumOpen && !ended && event.sessionMode !== 'SURVEY' ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-3xl space-y-6"
          >
            <div className="text-center space-y-2">
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-amber-300">Leaderboard</p>
              <h2 className="font-heading text-5xl md:text-6xl font-bold">Race so far</h2>
            </div>
            <LivePodium rows={leaderboard} tone="dark" size="stage" />
          </motion.div>
        ) : ended ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-5xl space-y-8"
          >
            <div className="text-center space-y-3">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-accent-lift">Session over</p>
              <h2 className="font-heading text-5xl md:text-6xl font-bold">
                {event.sessionMode === 'SURVEY' ? 'Survey results' : 'Thanks for playing'}
              </h2>
              <p className="text-white/60">
                {participantCount} participant{participantCount === 1 ? '' : 's'}
              </p>
            </div>

            {event.sessionMode !== 'SURVEY' && leaderboard.length > 0 && (
              <div className="max-w-xl mx-auto w-full">
                <LivePodium rows={leaderboard} tone="dark" size="stage" />
              </div>
            )}

            {finalResults.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[60vh] overflow-y-auto">
                {finalResults.map((tally, index) => (
                  <div key={tally.id} className="bg-white text-slate-900 rounded-3xl p-5 text-left">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                      Q{index + 1}
                    </span>
                    <div className="mt-2">
                      <QuestionResults
                        tally={tally}
                        palette={brandPalette}
                        revealCorrect={event.sessionMode !== 'SURVEY'}
                        compact
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              leaderboard.length > 0 &&
              event.sessionMode !== 'SURVEY' && (
                <ol className="mt-8 max-w-md mx-auto space-y-3 text-left">
                  {leaderboard.slice(0, 5).map((row) => (
                    <li
                      key={row.participantId}
                      className="flex justify-between bg-white/5 border border-white/10 rounded-2xl px-5 py-3"
                    >
                      <span>
                        {row.rank}. {row.name}
                      </span>
                      <span className="font-bold text-accent-lift">{row.score}</span>
                    </li>
                  ))}
                </ol>
              )
            )}
          </motion.div>
        ) : currentQuestionIndex < 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-8"
          >
            <div className="space-y-3">
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent-lift">Join now</p>
              <h2 className="font-heading text-5xl md:text-7xl font-bold">Scan or enter the PIN</h2>
            </div>
            <RoomPin code={event.roomCode} size="hero" tone="dark" />
            <div className="inline-flex flex-col items-center gap-4 bg-white text-slate-900 p-8 rounded-[2rem]">
              <QrCode className="w-5 h-5 text-accent" />
              <QRCodeSVG
                value={`${window.location.origin}/?code=${event.roomCode}`}
                size={220}
                fgColor="#0f172a"
                level="H"
              />
            </div>
          </motion.div>
        ) : activeQuestion ? (
          <motion.div
            key={activeQuestion.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-5xl space-y-8"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-[0.2em] text-accent-lift">
                Question {currentQuestionIndex + 1} of {event.questions.length}
              </span>
              <span className="text-sm text-white/70 tabular-nums">
                {responsesCount} / {participantCount} answers
              </span>
            </div>
            <h2 className="font-heading text-4xl md:text-6xl font-bold leading-tight">{activeQuestion.text}</h2>
            {activeQuestion.timeLimit ? (
              <div className="max-w-sm">
                <Countdown startedAt={questionStartedAt} timeLimit={activeQuestion.timeLimit} tone="dark" />
              </div>
            ) : null}
            {liveResults ? (
              <div className="bg-white text-slate-900 rounded-3xl p-6 md:p-8">
                <QuestionResults
                  tally={liveResults}
                  palette={brandPalette}
                  revealCorrect={revealed && event.sessionMode !== 'SURVEY'}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(activeQuestion.options || []).map((opt: string, idx: number) => (
                  <OptionTile key={idx} index={idx} label={opt} size="stage" />
                ))}
              </div>
            )}
          </motion.div>
        ) : null}
      </main>
    </div>
  );
};

export default AudienceDisplay;
