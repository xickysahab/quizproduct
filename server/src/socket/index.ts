import { Server, Socket } from 'socket.io';
import prisma from '../config/prisma';
import { verifyToken } from '../utils/auth';
import { verifyParticipantToken } from '../utils/participantToken';
import { canAccessEvent } from '../utils/access';
import { toParticipantQuestion } from '../utils/questionTypes';
import { tallyQuestion } from '../utils/tally';
import { isQuestionScored } from '../utils/sessionSettings';
import { getLeaderboard } from '../utils/leaderboard';
import type { LeaderboardRow } from '../utils/leaderboard';
import { liveEvents } from '../utils/liveEvents';
import { slog } from '../utils/slog';
import { responseBatcher } from '../utils/responseBatcher';

interface SocketUser {
  userId: string;
  role: string;
}

interface SocketParticipant {
  participantId: string;
  eventId: string;
}

/**
 * Current results for one question, or null if it has gone.
 * Shared by the host's live view and the reveal broadcast so the two can never
 * disagree about what the numbers are.
 */
const tallyForQuestion = async (questionId: string) => {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { responses: true },
  });
  if (!question) return null;
  return tallyQuestion(question, question.responses);
};

/**
 * Publishes one question's results to the room.
 *
 * Shared by the host's explicit reveal and by AUTO_AFTER_QUESTION, so the two
 * paths cannot drift on what gets sent — particularly on whether the answer key
 * is attached, which is the one thing that must never leak early.
 */
const makeRevealer = (io: Server) =>
  async (eventId: string, questionId: string): Promise<boolean> => {
    const stored = await prisma.question.findUnique({
      where: { id: questionId },
      select: {
        eventId: true,
        scored: true,
        correctOption: true,
        correctOptions: true,
        event: { select: { scoringEnabled: true, resultsReveal: true } },
      },
    });

    if (!stored || stored.eventId !== eventId) return false;

    // NEVER means the audience does not see the distribution at all.
    if (stored.event.resultsReveal === 'NEVER') return true;

    const tally = await tallyForQuestion(questionId);
    if (!tally) return true;

    // An ungraded question has no answer key to publish, whether that is
    // because the session is unscored or because this question opted out.
    const graded = isQuestionScored(stored.event.scoringEnabled, stored.scored);

    const revealPayload = {
      ...tally,
      correctOption: graded ? stored.correctOption : null,
      correctOptions: graded ? stored.correctOptions : [],
    };

    io.to(`event-${eventId}`).emit('participant:results', revealPayload);
    // Secondary host screens (projector / audience display) stay in the host
    // room, so they need their own copy of the reveal.
    io.to(`host-${eventId}`).emit('host:resultsRevealed', revealPayload);
    return true;
  };

/** Returns the authenticated user for host actions, or null if unauthorized. */
const getAuthorizedHost = async (socket: Socket, eventId: string): Promise<SocketUser | null> => {
  const user = socket.data.user as SocketUser | undefined;
  if (!user) return null;

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { hostId: true } });
  if (!event) return null;

  const allowed = await canAccessEvent(user.userId, user.role, event.hostId);
  return allowed ? user : null;
};

export const initializeSocket = (io: Server) => {
  const revealResultsFor = makeRevealer(io);

  // Identify the connection up front. Hosts present a login token, participants
  // present the token they received when joining a room; either may be absent
  // on a connection that has not identified itself yet.
  io.use((socket, next) => {
    const { token, participantToken } = socket.handshake.auth ?? {};

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        socket.data.user = { userId: decoded.userId, role: decoded.role };
      }
    }

    if (participantToken) {
      const decoded = verifyParticipantToken(participantToken);
      if (decoded) {
        socket.data.participant = {
          participantId: decoded.participantId,
          eventId: decoded.eventId,
        };
      }
    }

    next();
  });

  // Events that saw activity since the last tick. Counts are read from the
  // database rather than accumulated in memory, so they are absolute rather
  // than deltas, survive a host reconnect, and cannot be moved by a client.
  const dirtyEvents = new Map<string, { questionId?: string; participants: boolean }>();

  const markDirty = (eventId: string, patch: { questionId?: string; participants?: boolean }) => {
    const entry = dirtyEvents.get(eventId) ?? { participants: false };
    if (patch.questionId) entry.questionId = patch.questionId;
    if (patch.participants) entry.participants = true;
    dirtyEvents.set(eventId, entry);
  };

  liveEvents.subscribe('response:recorded', ({ eventId, questionId }) =>
    markDirty(eventId, { questionId })
  );
  liveEvents.subscribe('participant:joined', ({ eventId }) =>
    markDirty(eventId, { participants: true })
  );

  // Standings as of the last scoreboard beat, so the next one can show movement
  // rather than just position. Held in memory: it is presentation state for one
  // live session, not something worth a table. With more than one server process
  // a host on another instance would see no arrows — acceptable, and consistent
  // with the note on the counters below.
  const lastStandings = new Map<string, Map<string, number>>();

  // Q&A changes are coalesced the same way, so a burst of upvotes becomes one
  // "refresh your list" nudge rather than one frame per vote.
  const dirtyQa = new Set<string>();
  liveEvents.subscribe('qa:changed', ({ eventId }) => dirtyQa.add(eventId));

  setInterval(() => {
    if (dirtyQa.size === 0) return;
    const events = Array.from(dirtyQa);
    dirtyQa.clear();
    events.forEach((eventId) => {
      io.to(`event-${eventId}`).emit('qa:updated');
      io.to(`host-${eventId}`).emit('qa:updated');
    });
  }, 1000).unref?.();

  const flushCounters = async () => {
    if (dirtyEvents.size === 0) return;

    const pending = Array.from(dirtyEvents.entries());
    dirtyEvents.clear();

    await Promise.all(
      pending.map(async ([eventId, entry]) => {
        try {
          const [responses, participants] = await Promise.all([
            entry.questionId
              ? prisma.response.count({ where: { questionId: entry.questionId } })
              : Promise.resolve(null),
            entry.participants
              ? prisma.participant.count({ where: { eventId } })
              : Promise.resolve(null),
          ]);

          if (responses !== null && entry.questionId) {
            io.to(`host-${eventId}`).emit('host:responseCount', {
              questionId: entry.questionId,
              count: responses,
            });

            // The host watches the distribution fill in as answers land. This
            // is host-only: showing participants a live tally before they
            // answer would bias the result.
            const tally = await tallyForQuestion(entry.questionId);
            if (tally) io.to(`host-${eventId}`).emit('host:liveResults', tally);

            // Persist the write buffer first so the race board matches what
            // people just tapped, not what landed two seconds ago.
            await responseBatcher.flushNow();

            const [top, event] = await Promise.all([
              getLeaderboard(eventId, 8, 0),
              prisma.event.findUnique({
                where: { id: eventId },
                select: { scoringEnabled: true, leaderboardVisibility: true },
              }),
            ]);

            // An unscored session has no board at all; otherwise the host sees
            // it unless it was hidden outright.
            if (event?.scoringEnabled && event.leaderboardVisibility !== 'HIDDEN') {
              io.to(`host-${eventId}`).emit('host:leaderboard', { leaderboard: top });
            }

            // The room only shares the board when the host chose EVERYONE.
            if (event?.scoringEnabled && event.leaderboardVisibility === 'EVERYONE') {
              io.to(`event-${eventId}`).emit('participant:leaderboard', { leaderboard: top });
            }
          }

          if (participants !== null) {
            io.to(`host-${eventId}`).emit('host:participantCount', { count: participants });
          }
        } catch (error) {
          slog('warn', 'socket.counter_flush_failed', {
            eventId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  };

  // Once a second, so a burst of answers doesn't turn into a burst of frames.
  // Answers are batch-flushed to Postgres every 2s, so the count can trail
  // reality by that much — acceptable for a live readout, and honest.
  setInterval(() => {
    void flushCounters();
  }, 1000).unref?.();

  io.on('connection', (socket: Socket) => {
    // Host joins a room for a specific event
    socket.on('host:join', async (eventId: string) => {
      const host = await getAuthorizedHost(socket, eventId);
      if (!host) {
        socket.emit('host:unauthorized', { message: 'Not authorized to host this event.' });
        return;
      }
      socket.join(`host-${eventId}`);
    });

    // Participant joins the room they were admitted to. The room comes from the
    // signed token, not from the client, so one participant cannot take over
    // another's identity or listen in on an event they never joined.
    socket.on('participant:join', async () => {
      const participant = socket.data.participant as SocketParticipant | undefined;

      if (!participant) {
        socket.emit('participant:unauthorized', {
          message: 'Session expired. Please rejoin the room.',
        });
        return;
      }

      const { participantId, eventId } = participant;

      try {
        socket.join(`event-${eventId}`);

        await prisma.participant.update({
          where: { id: participantId },
          data: { socketId: socket.id },
        });

        const event = await prisma.event.findUnique({
          where: { id: eventId },
          include: { questions: { orderBy: { order: 'asc' } } },
        });

        if (event?.isLive && event.currentQuestionId) {
          const activeQuestion = event.questions.find((q) => q.id === event.currentQuestionId);

          if (activeQuestion) {
            const response = await prisma.response.findUnique({
              where: {
                questionId_participantId: {
                  questionId: activeQuestion.id,
                  participantId,
                },
              },
            });

            socket.emit('participant:questionActive', {
              question: toParticipantQuestion(activeQuestion),
              selectedOption: response ? response.selectedOption : null,
              selectedOptions: response ? response.selectedOptions : [],
              answerText: response ? response.answerText : null,
              startedAt: event.currentQuestionStartedAt,
            });
          }
        }

        io.to(`host-${eventId}`).emit('host:participantJoined', { participantId });
      } catch (error) {
        console.error('participant:join error:', error);
        socket.emit('participant:unauthorized', {
          message: 'Session expired. Please rejoin the room.',
        });
      }
    });

    // Host starts quiz or moves to next question
    socket.on('host:nextQuestion', async (eventId: string, question: { id?: string }) => {
      const host = await getAuthorizedHost(socket, eventId);
      if (!host) {
        socket.emit('host:unauthorized', { message: 'Not authorized to control this event.' });
        return;
      }

      if (!question?.id) return;

      // Read the question back from the database rather than trusting the
      // payload, so the broadcast question and the stored pointer always agree
      // and always belong to this event.
      const stored = await prisma.question.findUnique({ where: { id: question.id } });

      if (!stored || stored.eventId !== eventId) {
        socket.emit('host:unauthorized', { message: 'That question does not belong to this event.' });
        return;
      }

      // Captured before the pointer moves, so auto-reveal can push the results
      // of the question the room has just finished.
      const [previousState, eventSettings] = await Promise.all([
        prisma.event.findUnique({ where: { id: eventId }, select: { currentQuestionId: true } }),
        prisma.event.findUnique({ where: { id: eventId }, select: { resultsReveal: true } }),
      ]);
      const previousQuestionId =
        previousState?.currentQuestionId && previousState.currentQuestionId !== stored.id
          ? previousState.currentQuestionId
          : null;

      // The start time is what makes the answer deadline enforceable server-side.
      const startedAt = new Date();
      await prisma.event.update({
        where: { id: eventId },
        data: {
          currentQuestionId: stored.id,
          currentQuestionStartedAt: startedAt,
          isLive: true,
        },
      });

      // The answer key never leaves the server — see toParticipantQuestion.
      io.to(`event-${eventId}`).emit('participant:questionActive', {
        question: toParticipantQuestion(stored),
        selectedOption: null,
        selectedOptions: [],
        answerText: null,
        startedAt,
      });

      // AUTO_AFTER_QUESTION: the previous question's results go out to the room
      // as soon as the host moves on, without waiting for a second button.
      if (previousQuestionId && eventSettings?.resultsReveal === 'AUTO_AFTER_QUESTION') {
        void revealResultsFor(eventId, previousQuestionId);
      }

      // The host keeps the full row, including the answer key.
      io.to(`host-${eventId}`).emit('host:questionActive', {
        question: stored,
        startedAt,
      });
    });

    // Host ends quiz
    socket.on('host:endQuiz', async (eventId: string) => {
      const host = await getAuthorizedHost(socket, eventId);
      if (!host) {
        socket.emit('host:unauthorized', { message: 'Not authorized to control this event.' });
        return;
      }

      // Persist any answers still sitting in the write buffer before we tally.
      await responseBatcher.flushNow();

      await prisma.event.update({
        where: { id: eventId },
        data: { isLive: false, currentQuestionId: null, currentQuestionStartedAt: null },
      });

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
          title: true,
          sessionMode: true,
          questions: {
            orderBy: { order: 'asc' },
            include: { responses: true },
          },
        },
      });

      const totalParticipants = await prisma.participant.count({ where: { eventId } });
      const questions = (event?.questions || []).map((question) =>
        tallyQuestion(question, question.responses)
      );
      const leaderboard =
        event?.sessionMode === 'SURVEY' ? [] : await getLeaderboard(eventId, 8, 0);

      // Participants get the full distribution at the end — surveys especially
      // need this, since there is no score screen to land on.
      const ended = {
        title: event?.title,
        sessionMode: event?.sessionMode || 'QUIZ',
        totalParticipants,
        questions,
        leaderboard,
      };
      io.to(`event-${eventId}`).emit('participant:quizEnded', ended);
      io.to(`host-${eventId}`).emit('host:quizEnded', ended);
    });

    /**
     * The scoreboard beat between questions.
     *
     * Not a readout — a deliberate pause. The room looks up, sees who moved,
     * reacts, and the host gets a natural moment to talk. Movement is the
     * point, so each row carries its change in rank since the previous beat.
     */
    socket.on('host:showScoreboard', async (eventId: string) => {
      const host = await getAuthorizedHost(socket, eventId);
      if (!host) {
        socket.emit('host:unauthorized', { message: 'Not authorized to control this event.' });
        return;
      }

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { scoringEnabled: true, leaderboardVisibility: true },
      });

      if (!event?.scoringEnabled) return;

      const standings = await getLeaderboard(eventId, 10, 0);
      const previous = lastStandings.get(eventId);

      const rows = standings.map((row: LeaderboardRow) => {
        const was = previous?.get(row.participantId);
        return {
          ...row,
          // null on the first beat — nobody has moved from nowhere.
          previousRank: was ?? null,
          movement: was == null ? 0 : was - row.rank,
        };
      });

      lastStandings.set(
        eventId,
        new Map(standings.map((row: LeaderboardRow) => [row.participantId, row.rank]))
      );

      io.to(`host-${eventId}`).emit('host:scoreboard', { standings: rows });

      // The room only sees it if the host set the leaderboard to everyone.
      if (event.leaderboardVisibility === 'EVERYONE') {
        io.to(`event-${eventId}`).emit('participant:scoreboard', { standings: rows });
      }
    });

    socket.on('host:hideScoreboard', async (eventId: string) => {
      const host = await getAuthorizedHost(socket, eventId);
      if (!host) return;
      io.to(`host-${eventId}`).emit('host:scoreboardClosed');
      io.to(`event-${eventId}`).emit('participant:scoreboardClosed');
    });

    // Host pushes the current question's results out to the room. Explicit
    // rather than automatic: the host decides when the audience sees the
    // distribution, which is the whole point of a reveal.
    socket.on('host:revealResults', async (eventId: string, questionId: string) => {
      const host = await getAuthorizedHost(socket, eventId);
      if (!host) {
        socket.emit('host:unauthorized', { message: 'Not authorized to control this event.' });
        return;
      }

      if (typeof questionId !== 'string') return;

      const ok = await revealResultsFor(eventId, questionId);
      if (!ok) {
        socket.emit('host:unauthorized', { message: 'That question does not belong to this event.' });
      }
    });

    // Host puts the race on the projector / phones between questions.
    socket.on('host:showPodium', async (eventId: string) => {
      const host = await getAuthorizedHost(socket, eventId);
      if (!host) {
        socket.emit('host:unauthorized', { message: 'Not authorized to control this event.' });
        return;
      }

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { scoringEnabled: true, podiumAtEnd: true },
      });
      // Nothing to rank, or the host turned the podium off for this session.
      if (!event?.scoringEnabled || !event.podiumAtEnd) return;

      await responseBatcher.flushNow();
      const leaderboard = await getLeaderboard(eventId, 8, 0);
      const payload = { leaderboard, spotlight: true };
      io.to(`host-${eventId}`).emit('host:podium', payload);
      io.to(`event-${eventId}`).emit('participant:podium', payload);
    });

    // `participant:submitAnswer` used to live here. It took no payload and did
    // no validation, so any participant could loop it and move the host's
    // counter at will. The counter is now derived from accepted responses via
    // the liveEvents bus — see flushCounters above.
  });
};
