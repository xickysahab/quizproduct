import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/logger';
import { canAccessEvent } from '../utils/access';

export const addQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId, text, options, correctOption, timeLimit } = req.body;

    if (!eventId || !text || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ message: 'Event ID, question text, and at least 2 options are required.' });
      return;
    }

    // Check if event exists and is within the user's hierarchy
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden. You do not have access to this event.' });
      return;
    }

    // Get current question count to set order
    const count = await prisma.question.count({ where: { eventId } });

    const question = await prisma.question.create({
      data: {
        eventId,
        text,
        options,
        correctOption: correctOption !== undefined && correctOption !== null ? Number(correctOption) : null,
        order: count + 1,
        timeLimit: timeLimit ? Number(timeLimit) : null,
      },
    });

    await logActivity(req.user?.userId, 'ADD_QUESTION', 'Question', question.id, { eventId, text: question.text });

    res.status(201).json({ message: 'Question created successfully', question });
  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { text, options, correctOption, timeLimit } = req.body;

    const existingQuestion = await prisma.question.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!existingQuestion || !(await canAccessEvent(req.user!.userId, req.user!.role, existingQuestion.event.hostId))) {
      res.status(403).json({ message: 'Forbidden. Question not found or unauthorized.' });
      return;
    }

    const question = await prisma.question.update({
      where: { id },
      data: {
        text: text || existingQuestion.text,
        options: options || existingQuestion.options,
        correctOption: correctOption !== undefined ? (correctOption === null ? null : Number(correctOption)) : existingQuestion.correctOption,
        timeLimit: timeLimit !== undefined ? (timeLimit === null || timeLimit === 0 ? null : Number(timeLimit)) : existingQuestion.timeLimit,
      },
    });

    await logActivity(req.user?.userId, 'UPDATE_QUESTION', 'Question', question.id, { eventId: existingQuestion.eventId, text: question.text });

    res.status(200).json({ message: 'Question updated successfully', question });
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const existingQuestion = await prisma.question.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!existingQuestion || !(await canAccessEvent(req.user!.userId, req.user!.role, existingQuestion.event.hostId))) {
      res.status(403).json({ message: 'Forbidden. Question not found or unauthorized.' });
      return;
    }

    await prisma.question.delete({ where: { id } });

    await logActivity(req.user?.userId, 'DELETE_QUESTION', 'Question', id, { eventId: existingQuestion.eventId, text: existingQuestion.text });

    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
