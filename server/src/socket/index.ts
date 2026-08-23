import { Server, Socket } from 'socket.io';
import prisma from '../config/prisma';
import { verifyToken } from '../utils/auth';
import { verifyParticipantToken } from '../utils/participantToken';
import { canAccessEvent } from '../utils/access';
import { toParticipantQuestion } from '../utils/questionTypes';
import { tallyQuestion } from '../utils/tally';
import { getLeaderboard } from '../utils/leaderboard';
import { liveEvents } from '../utils/liveEvents';
import { slog } from '../utils/slog';

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

            // Pushed rather than polled. The client used to re-fetch the whole
            // leaderboard on every response batch, once a second.
            const top = await getLeaderboard(eventId, 5, 0);
            io.to(`host-${eventId}`).emit('host:leaderboard', { leaderboard: top });
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

      await prisma.event.update({
        where: { id: eventId },
        data: { isLive: false, currentQuestionId: null, currentQuestionStartedAt: null },
      });

      io.to(`event-${eventId}`).emit('participant:quizEnded');
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

      const stored = await prisma.question.findUnique({
        where: { id: questionId },
        select: { eventId: true, correctOption: true, correctOptions: true },
      });

      if (!stored || stored.eventId !== eventId) {
        socket.emit('host:unauthorized', { message: 'That question does not belong to this event.' });
        return;
      }

      const tally = await tallyForQuestion(questionId);
      if (!tally) return;

      // The answer key is attached only here, on an explicit reveal — never on
      // the broadcast that opens the question.
      io.to(`event-${eventId}`).emit('participant:results', {
        ...tally,
        correctOption: stored.correctOption,
        correctOptions: stored.correctOptions,
      });
    });

    // `participant:submitAnswer` used to live here. It took no payload and did
    // no validation, so any participant could loop it and move the host's
    // counter at will. The counter is now derived from accepted responses via
    // the liveEvents bus — see flushCounters above.
  });
};
