import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';

export const getStaffStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const [events, liveEvents, participants] = await Promise.all([
      prisma.event.count({ where: { hostId: userId } }),
      prisma.event.count({ where: { hostId: userId, isLive: true } }),
      prisma.participant.count({ where: { event: { hostId: userId } } }),
    ]);

    res.json({ events, liveEvents, participants });
  } catch (error) {
    console.error('Error fetching staff stats', error);
    res.status(500).json({ message: 'Server error' });
  }
};
