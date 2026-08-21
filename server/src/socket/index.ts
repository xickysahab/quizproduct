import { Server, Socket } from 'socket.io';
import prisma from '../config/prisma';
import { verifyToken } from '../utils/auth';
import { verifyParticipantToken } from '../utils/participantToken';
import { canAccessEvent } from '../utils/access';

interface SocketUser {
  userId: string;
  role: string;
}

interface SocketParticipant {
  participantId: string;
  eventId: string;
}

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

  // Aggregated vote counts per eventId, flushed to hosts once a second so a
  // burst of answers doesn't turn into a burst of socket frames.
  const voteCounts = new Map<string, number>();

  setInterval(() => {
    voteCounts.forEach((count, eventId) => {
      if (count > 0) {
        io.to(`host-${eventId}`).emit('host:newResponseBatch', { count });
      }
      // Drop the entry entirely instead of parking a zero, so the map does not
      // grow for the lifetime of the process.
      voteCounts.delete(eventId);
    });
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
              question: activeQuestion,
              selectedOption: response ? response.selectedOption : null,
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
      await prisma.event.update({
        where: { id: eventId },
        data: {
          currentQuestionId: stored.id,
          currentQuestionStartedAt: new Date(),
          isLive: true,
        },
      });

      io.to(`event-${eventId}`).emit('participant:questionActive', { question: stored });
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

    // Participant submits an answer — only used to nudge the host's live counter.
    socket.on('participant:submitAnswer', () => {
      const participant = socket.data.participant as SocketParticipant | undefined;
      if (!participant) return;

      const current = voteCounts.get(participant.eventId) || 0;
      voteCounts.set(participant.eventId, current + 1);
    });
  });
};
