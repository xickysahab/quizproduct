import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';
import { hashPassword } from '../utils/auth';

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

    res.status(201).json({ message: 'Staff created', user: { id: staff.id, email: staff.email } });
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
      }
    });
    res.json(staff);
  } catch (error) {
    console.error('Error fetching staff', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getTenantEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const events = await prisma.event.findMany({
      where: {
        host: {
          parentUserId: req.user!.userId,
        }
      },
      include: {
        host: {
          select: { name: true }
        },
        _count: {
          select: { participants: true, questions: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(events);
  } catch (error) {
    console.error('Error fetching tenant events', error);
    res.status(500).json({ message: 'Server error' });
  }
};
