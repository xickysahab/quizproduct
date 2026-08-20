import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';
import { hashPassword } from '../utils/auth';
import { logActivity } from '../utils/logger';

export const createSubAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ message: 'Name, email and password are required.' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'User with this email already exists.' });
      return;
    }

    const hashedPassword = await hashPassword(password);
    const subAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'SUBADMIN',
        parentUserId: req.user!.userId,
      },
    });

    await logActivity(req.user!.userId, 'CREATE_SUBADMIN', 'User', subAdmin.id, { name, email });

    res.status(201).json({
      message: 'SubAdmin created',
      user: { id: subAdmin.id, name: subAdmin.name, email: subAdmin.email, role: subAdmin.role },
    });
  } catch (error) {
    console.error('Error creating subadmin', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getSubAdmins = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const subAdmins = await prisma.user.findMany({
      where: { role: 'SUBADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: { select: { subUsers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(subAdmins);
  } catch (error) {
    console.error('Error fetching subadmins', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllTenants = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenants = await prisma.user.findMany({
      where: { role: 'TENANT' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        parentUser: { select: { name: true, email: true } },
        _count: { select: { subUsers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPlatformStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [subAdmins, tenants, staff, events, participants, recentLogs] = await Promise.all([
      prisma.user.count({ where: { role: 'SUBADMIN' } }),
      prisma.user.count({ where: { role: 'TENANT' } }),
      prisma.user.count({ where: { role: 'STAFF' } }),
      prisma.event.count(),
      prisma.participant.count(),
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { user: { select: { name: true, email: true, role: true } } },
      }),
    ]);

    res.json({ subAdmins, tenants, staff, events, participants, recentLogs });
  } catch (error) {
    console.error('Error fetching platform stats', error);
    res.status(500).json({ message: 'Server error' });
  }
};
