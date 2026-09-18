import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { canAccessEvent } from '../utils/access';
import { logActivity } from '../utils/logger';
import { cleanTeamNames } from '../utils/teams';

/**
 * Sets a session's teams, replacing any there were. An empty list turns team
 * mode off. Refused once anyone has joined: replacing the teams then would
 * silently move people off the side they picked.
 */
export const setTeams = async (req: AuthRequest, res: Response): Promise<void> => {
  const eventId = req.params.id as string;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { hostId: true, title: true } });
  if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
    res.status(403).json({ message: 'Forbidden: You do not have access to this event.' });
    return;
  }

  const parsed = cleanTeamNames(req.body?.names);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  if (await prisma.participant.count({ where: { eventId } })) {
    res.status(409).json({ message: 'People have already joined. Clear the participants first to change the teams.' });
    return;
  }

  await prisma.$transaction([
    prisma.team.deleteMany({ where: { eventId } }),
    prisma.team.createMany({ data: parsed.names.map((name) => ({ eventId, name })) }),
  ]);
  const teams = await prisma.team.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });

  await logActivity(req.user?.userId, 'SET_TEAMS', 'Event', eventId, { title: event.title, teams: parsed.names });
  res.json({ teams });
};
