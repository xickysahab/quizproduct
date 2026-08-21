import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';
import { hashPassword } from '../utils/auth';
import { logActivity } from '../utils/logger';
import { validateNewUser } from '../utils/validation';

export const createStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = validateNewUser(req.body);
    if ('error' in parsed) {
      res.status(400).json({ message: parsed.error });
      return;
    }
    const { name, email, password } = parsed.value;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    const hashedPassword = await hashPassword(password);
    const parent = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true },
    });
    const staff = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'STAFF',
        parentUserId: req.user!.userId,
        organizationId: parent?.organizationId,
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
        isActive: true,
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
