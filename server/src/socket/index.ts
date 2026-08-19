import { Server, Socket } from 'socket.io';
import prisma from '../config/prisma';

export const initializeSocket = (io: Server) => {
  // Map to store aggregated vote counts per eventId
  const voteCounts = new Map<string, number>();

  // Interval to flush aggregated votes to hosts every 1 second
  setInterval(() => {
    voteCounts.forEach((count, eventId) => {
      if (count > 0) {
        io.to(`host-${eventId}`).emit('host:newResponseBatch', { count });
        voteCounts.set(eventId, 0); // Reset count after emitting
      }
    });
  }, 1000);

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);

    // Host joins a room for a specific event
    socket.on('host:join', (eventId: string) => {
      socket.join(`host-${eventId}`);
      console.log(`👨‍🏫 Host joined event room: host-${eventId}`);
    });

    // Participant joins a room for a specific event
    socket.on('participant:join', async (eventId: string, participantId: string) => {
      socket.join(`event-${eventId}`);
      console.log(`🙋‍♂️ Participant ${participantId} joined event room: event-${eventId}`);
      
      // Update participant socket ID in DB
      await prisma.participant.update({
        where: { id: participantId },
        data: { socketId: socket.id },
      });

      // Check if event is live and send current question
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { questions: true }
      });

      if (event?.isLive && event.currentQuestionId) {
        const activeQuestion = event.questions.find(q => q.id === event.currentQuestionId);
        if (activeQuestion) {
          // Check if this participant has already answered
          const response = await prisma.response.findUnique({
            where: {
              questionId_participantId: {
                questionId: activeQuestion.id,
                participantId
              }
            }
          });
          
          socket.emit('participant:questionActive', { 
            question: activeQuestion,
            selectedOption: response ? response.selectedOption : null
          });
        }
      }
      
      // Notify host that participant count changed
      io.to(`host-${eventId}`).emit('host:participantJoined', { participantId });
    });

    // Host starts quiz or moves to next question
    socket.on('host:nextQuestion', async (eventId: string, question: any) => {
      // Broadcast to all participants in this event
      io.to(`event-${eventId}`).emit('participant:questionActive', { question });
      
      // Update event currentQuestionId in DB
      await prisma.event.update({
        where: { id: eventId },
        data: { currentQuestionId: question.id, isLive: true }
      });
      
      console.log(`🚀 Event ${eventId} moved to question ${question.id}`);
    });

    // Host ends quiz
    socket.on('host:endQuiz', async (eventId: string) => {
      io.to(`event-${eventId}`).emit('participant:quizEnded');
      
      await prisma.event.update({
        where: { id: eventId },
        data: { isLive: false, currentQuestionId: null }
      });
      console.log(`🛑 Event ${eventId} ended.`);
    });

    // Participant submits an answer (Notify host real-time via batched event)
    socket.on('participant:submitAnswer', (eventId: string) => {
      // Increment the vote count for this event instead of emitting immediately
      const currentCount = voteCounts.get(eventId) || 0;
      voteCounts.set(eventId, currentCount + 1);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      // In a full app, we would remove the socketId from the DB here
    });
  });
};
