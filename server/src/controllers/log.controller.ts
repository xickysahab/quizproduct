import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export const getActivityLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    
    // Validate SUPERADMIN role
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'SUPERADMIN') {
      res.status(403).json({ message: 'Forbidden: Only SUPERADMIN users can view activity logs.' });
      return;
    }

    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true, role: true }
        }
      }
    });

    res.status(200).json({ logs });
  } catch (error) {
    console.error('Fetch activity logs error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
