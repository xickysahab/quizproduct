import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';
import { hashPassword } from '../utils/auth';

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

    res.status(201).json({ message: 'Tenant created', user: { id: tenant.id, email: tenant.email } });
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
      }
    });
    res.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants', error);
    res.status(500).json({ message: 'Server error' });
  }
};
