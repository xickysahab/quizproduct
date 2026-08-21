import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { getAccessibleHostIds } from '../utils/access';
import { parsePagination } from '../utils/validation';

export const getActivityLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, role } = req.user!;

    if (role !== 'SUPERADMIN' && role !== 'SUBADMIN') {
      res.status(403).json({ message: 'Forbidden: Only admins can view activity logs.' });
      return;
    }

    // SUPERADMIN sees all logs; SUBADMIN sees logs from users in their hierarchy
    const scopedUserIds = await getAccessibleHostIds(userId, role);
    const where = scopedUserIds === null ? undefined : { userId: { in: scopedUserIds } };

    const { skip, take, page, limit } = parsePagination(req.query, {
      defaultLimit: 100,
      maxLimit: 200,
    });

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: { name: true, email: true, role: true },
          },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    res.status(200).json({
      logs,
      pagination: { page, limit, total, hasMore: skip + logs.length < total },
    });
  } catch (error) {
    console.error('Fetch activity logs error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
