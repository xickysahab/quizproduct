import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { responseBatcher } from '../utils/responseBatcher';

export const joinEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomCode, name } = req.body;

    if (!roomCode || !name) {
      res.status(400).json({ message: 'Room code and participant name are required.' });
      return;
    }

    const formattedCode = roomCode.trim().toUpperCase();

    const event = await prisma.event.findUnique({
      where: { roomCode: formattedCode },
      select: {
        id: true,
        title: true,
        isLive: true,
        currentQuestionId: true,
      },
    });

    if (!event) {
      res.status(404).json({ message: 'Invalid room code. Event not found.' });
      return;
    }

    const participant = await prisma.participant.create({
      data: {
        eventId: event.id,
        name: name.trim(),
      },
    });

    res.status(201).json({
      message: 'Joined event successfully',
      participant: {
        id: participant.id,
        name: participant.name,
      },
      event,
    });
  } catch (error) {
    console.error('Join event error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const submitResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const { participantId, questionId, selectedOption } = req.body;

    if (!participantId || !questionId || selectedOption === undefined) {
      res.status(400).json({ message: 'Participant ID, question ID, and selected option are required.' });
      return;
    }

    const question = await prisma.question.findUnique({ 
      where: { id: questionId },
      include: { event: true } 
    });

    if (!question) {
      res.status(404).json({ message: 'Question not found.' });
      return;
    }

    // Validate if the question is currently active for the event
    if (!question.event.isLive || question.event.currentQuestionId !== questionId) {
      res.status(400).json({ message: 'This question is no longer active.' });
      return;
    }

    const isCorrect = question.correctOption === Number(selectedOption);

    // Add to in-memory batch instead of hitting DB immediately
    responseBatcher.addResponse({
      questionId,
      participantId,
      selectedOption: Number(selectedOption),
      isCorrect,
    });

    res.status(200).json({ message: 'Response queued successfully', batched: true });
  } catch (error) {
    console.error('Submit response error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
