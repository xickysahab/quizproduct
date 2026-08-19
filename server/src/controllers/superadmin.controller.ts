import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';
import { hashPassword } from '../utils/auth';

export const createSubAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
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
    const subAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'SUBADMIN',
        parentUserId: req.user!.userId,
      }
    });

    res.status(201).json({ message: 'SubAdmin created', user: { id: subAdmin.id, email: subAdmin.email } });
  } catch (error) {
    console.error('Error creating subadmin', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getSubAdmins = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const subAdmins = await prisma.user.findMany({
      where: {
        role: 'SUBADMIN',
        parentUserId: req.user!.userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      }
    });
    res.json(subAdmins);
  } catch (error) {
    console.error('Error fetching subadmins', error);
    res.status(500).json({ message: 'Server error' });
  }
};
