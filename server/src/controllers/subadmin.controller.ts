import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';
import { hashPassword } from '../utils/auth';
import { logActivity } from '../utils/logger';
import { getAccessibleHostIds } from '../utils/access';

export const createTenant = async (req: AuthRequest, res: Response): Promise<void> => {
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
    const tenant = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'TENANT',
        parentUserId: req.user!.userId,
      }
    });

    await logActivity(req.user!.userId, 'CREATE_TENANT', 'User', tenant.id, { name, email });

    res.status(201).json({ message: 'Tenant created', user: { id: tenant.id, name: tenant.name, email: tenant.email, role: tenant.role } });
  } catch (error) {
    console.error('Error creating tenant', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getTenants = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenants = await prisma.user.findMany({
      where: {
        role: 'TENANT',
        parentUserId: req.user!.userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
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

export const getSubAdminStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, role } = req.user!;
    const hostIds = await getAccessibleHostIds(userId, role);

    const [tenants, staff, events, participants] = await Promise.all([
      prisma.user.count({ where: { role: 'TENANT', parentUserId: userId } }),
      prisma.user.count({ where: { role: 'STAFF', parentUser: { parentUserId: userId } } }),
      prisma.event.count({ where: hostIds === null ? undefined : { hostId: { in: hostIds } } }),
      prisma.participant.count({ where: hostIds === null ? undefined : { event: { hostId: { in: hostIds } } } }),
    ]);

    res.json({ tenants, staff, events, participants });
  } catch (error) {
    console.error('Error fetching subadmin stats', error);
    res.status(500).json({ message: 'Server error' });
  }
};
