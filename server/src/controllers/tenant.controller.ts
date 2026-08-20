import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';
import { hashPassword } from '../utils/auth';
import { logActivity } from '../utils/logger';

export const createStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ message: 'Missing fields' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    const hashedPassword = await hashPassword(password);
    const staff = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'STAFF',
        parentUserId: req.user!.userId,
      }
    });

    await logActivity(req.user!.userId, 'CREATE_STAFF', 'User', staff.id, { name, email });

    res.status(201).json({ message: 'Staff created', user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role } });
  } catch (error) {
    console.error('Error creating staff', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staff = await prisma.user.findMany({
      where: {
        role: 'STAFF',
        parentUserId: req.user!.userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(staff);
  } catch (error) {
    console.error('Error fetching staff', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getTenantStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const [staff, events, participants, liveEvents] = await Promise.all([
      prisma.user.count({ where: { role: 'STAFF', parentUserId: userId } }),
      prisma.event.count({
        where: { OR: [{ hostId: userId }, { host: { parentUserId: userId } }] },
      }),
      prisma.participant.count({
        where: { event: { OR: [{ hostId: userId }, { host: { parentUserId: userId } }] } },
      }),
      prisma.event.count({
        where: { isLive: true, OR: [{ hostId: userId }, { host: { parentUserId: userId } }] },
      }),
    ]);

    res.json({ staff, events, participants, liveEvents });
  } catch (error) {
    console.error('Error fetching tenant stats', error);
    res.status(500).json({ message: 'Server error' });
  }
};
