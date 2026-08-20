import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { getAccessibleHostIds } from '../utils/access';

export const getActivityLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, role } = req.user!;

    if (role !== 'SUPERADMIN' && role !== 'SUBADMIN') {
      res.status(403).json({ message: 'Forbidden: Only admins can view activity logs.' });
      return;
    }

    // SUPERADMIN sees all logs; SUBADMIN sees logs from users in their hierarchy
    const scopedUserIds = await getAccessibleHostIds(userId, role);

    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const logs = await prisma.activityLog.findMany({
      where: scopedUserIds === null ? undefined : { userId: { in: scopedUserIds } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { name: true, email: true, role: true },
        },
      },
    });

    res.status(200).json({ logs });
  } catch (error) {
    console.error('Fetch activity logs error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
