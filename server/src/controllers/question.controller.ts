import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/logger';
import { canAccessEvent } from '../utils/access';
import { normalizeQuestionInput } from '../utils/questionTypes';
import { assertCanAddQuestion } from '../utils/usage';
import { slog } from '../utils/slog';

export const addQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = normalizeQuestionInput(req.body || {});
    if ('error' in parsed) {
      res.status(400).json({ message: parsed.error });
      return;
    }

    const eventId = req.body?.eventId;
    if (typeof eventId !== 'string') {
      res.status(400).json({ message: 'Event ID is required.' });
      return;
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden. You do not have access to this event.' });
      return;
    }

    const count = await prisma.question.count({ where: { eventId } });
    const quota = await assertCanAddQuestion(event.organizationId, count);
    if (!quota.ok) {
      res.status(402).json({ message: quota.message });
      return;
    }

    const question = await prisma.question.create({
      data: {
        eventId,
        type: parsed.value.type,
        text: parsed.value.text,
        options: parsed.value.options,
        correctOption: parsed.value.correctOption,
        correctOptions: parsed.value.correctOptions,
        order: count + 1,
        timeLimit: parsed.value.timeLimit,
      },
    });

    await logActivity(req.user?.userId, 'ADD_QUESTION', 'Question', question.id, {
      eventId,
      text: question.text,
      type: question.type,
    });

    res.status(201).json({ message: 'Question created successfully', question });
  } catch (error) {
    slog('error', 'question.add_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const parsed = normalizeQuestionInput({
      type: req.body?.type ?? existingQuestion.type,
      text: req.body?.text ?? existingQuestion.text,
      options: req.body?.options ?? existingQuestion.options,
      correctOption: req.body?.correctOption === undefined ? existingQuestion.correctOption : req.body.correctOption,
      correctOptions: req.body?.correctOptions ?? existingQuestion.correctOptions,
      timeLimit: req.body?.timeLimit === undefined ? existingQuestion.timeLimit : req.body.timeLimit,
    });

    if ('error' in parsed) {
      res.status(400).json({ message: parsed.error });
      return;
    }

    const question = await prisma.question.update({
      where: { id },
      data: parsed.value,
    });

    await logActivity(req.user?.userId, 'UPDATE_QUESTION', 'Question', question.id, {
      eventId: existingQuestion.eventId,
      text: question.text,
    });

    res.status(200).json({ message: 'Question updated successfully', question });
  } catch (error) {
    slog('error', 'question.update_failed', { error: error instanceof Error ? error.message : String(error) });
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

    await logActivity(req.user?.userId, 'DELETE_QUESTION', 'Question', id, {
      eventId: existingQuestion.eventId,
      text: existingQuestion.text,
    });

    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (error) {
    slog('error', 'question.delete_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
