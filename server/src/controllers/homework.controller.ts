import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ParticipantRequest } from '../middleware/participant.middleware';
import { canAccessEvent } from '../utils/access';
import { logActivity } from '../utils/logger';
import { parseWindow, windowProblem } from '../utils/homework';
import { toParticipantQuestion } from '../utils/questionTypes';

/** Host: turn a session into homework with an open/close window, or back to live. */
export const setHomework = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { selfPaced, opensAt, closesAt } = req.body || {};

  const event = await prisma.event.findUnique({ where: { id }, select: { hostId: true, isLive: true, title: true } });
  if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
    res.status(403).json({ message: 'Forbidden: You do not have access to this event.' });
    return;
  }

  if (selfPaced !== true) {
    await prisma.event.update({ where: { id }, data: { selfPaced: false, opensAt: null, closesAt: null } });
    res.json({ selfPaced: false, opensAt: null, closesAt: null });
    return;
  }

  if (event.isLive) {
    res.status(409).json({ message: 'End the live session before setting it as homework.' });
    return;
  }

  const window = parseWindow(opensAt, closesAt);
  if (!window.ok) {
    res.status(400).json({ message: window.message });
    return;
  }

  const updated = await prisma.event.update({
    where: { id },
    data: { selfPaced: true, opensAt: window.opensAt, closesAt: window.closesAt },
    select: { selfPaced: true, opensAt: true, closesAt: true },
  });
  await logActivity(req.user?.userId, 'SET_HOMEWORK', 'Event', id, { title: event.title, closesAt: updated.closesAt });
  res.json(updated);
};

/** Participant: every question, and which of them they have already answered. */
export const getHomework = async (req: ParticipantRequest, res: Response): Promise<void> => {
  const { participantId, eventId } = req.participant!;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      selfPaced: true,
      opensAt: true,
      closesAt: true,
      scoringEnabled: true,
      questions: { orderBy: { order: 'asc' } },
    },
  });
  if (!event?.selfPaced) {
    res.status(404).json({ message: 'This session is not homework.' });
    return;
  }

  const problem = windowProblem(event);
  if (problem) {
    res.status(403).json({ message: problem, opensAt: event.opensAt, closesAt: event.closesAt });
    return;
  }

  const answered = await prisma.response.findMany({
    where: { participantId, question: { eventId } },
    select: { questionId: true },
  });

  res.json({
    title: event.title,
    closesAt: event.closesAt,
    scored: event.scoringEnabled,
    questions: event.questions.map(toParticipantQuestion),
    answered: answered.map((r) => r.questionId),
  });
};
