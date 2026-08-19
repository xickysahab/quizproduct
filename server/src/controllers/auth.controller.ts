import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ message: 'Name, email, and password are required.' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'User with this email already exists.' });
      return;
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    const token = generateToken(user.id, user.email);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required.' });
      return;
    }

    // Auto-create main admin if logging in with admin@admin.com and it doesn't exist
    if (email === 'admin@admin.com' && password === 'admin') {
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        const hashedPassword = await hashPassword(password);
        user = await prisma.user.create({
          data: {
            name: 'Main Admin',
            email,
            password: hashedPassword,
          },
        });
      }
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    const token = generateToken(user.id, user.email);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.email === 'admin@admin.com' ? 'ADMIN' : user.role,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ message: error?.message || 'Internal server error', details: String(error) });
  }
};
