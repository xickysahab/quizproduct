import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { canManageUser } from '../utils/access';
import { hashPassword } from '../utils/auth';
import { logActivity } from '../utils/logger';
import { invalidateUserStatus, bumpTokenVersion } from '../utils/userStatus';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Rename, deactivate/reactivate, or reset the password of a user inside the
 * caller's hierarchy. Deactivation is the intended way to offboard somebody:
 * their history stays intact but they can no longer sign in.
 */
export const updateManagedUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetId = req.params.id as string;
    const { name, isActive, password } = req.body || {};

    const allowed = await canManageUser(req.user!.userId, req.user!.role, targetId);
    if (!allowed) {
      res.status(403).json({ message: 'You do not have permission to manage this user.' });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!target) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const data: { name?: string; isActive?: boolean; password?: string } = {};

    if (typeof name === 'string' && name.trim()) {
      data.name = name.trim();
    }

    if (typeof isActive === 'boolean') {
      data.isActive = isActive;
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        res
          .status(400)
          .json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
        return;
      }
      data.password = await hashPassword(password);
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ message: 'Nothing to update.' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: targetId },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    invalidateUserStatus(targetId);
    if (data.password || data.isActive === false) {
      await bumpTokenVersion(targetId);
    }

    await logActivity(req.user!.userId, 'UPDATE_USER', 'User', targetId, {
      email: target.email,
      renamed: data.name !== undefined,
      passwordReset: data.password !== undefined,
      isActive: data.isActive,
    });

    res.status(200).json({ message: 'User updated.', user: updated });
  } catch (error) {
    console.error('Update managed user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Permanent removal, allowed only when nothing depends on the account. Anything
 * with history is refused with a pointer to deactivation, because deleting it
 * would either fail on a foreign key or silently destroy quiz results.
 */
export const deleteManagedUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetId = req.params.id as string;

    const allowed = await canManageUser(req.user!.userId, req.user!.role, targetId);
    if (!allowed) {
      res.status(403).json({ message: 'You do not have permission to manage this user.' });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        email: true,
        name: true,
        _count: { select: { events: true, subUsers: true } },
      },
    });

    if (!target) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    if (target._count.subUsers > 0) {
      res.status(409).json({
        message: `This user still manages ${target._count.subUsers} account(s). Move or remove those first, or deactivate this user instead.`,
      });
      return;
    }

    if (target._count.events > 0) {
      res.status(409).json({
        message: `This user owns ${target._count.events} quiz(zes) with history. Deactivate the account instead to keep the results.`,
      });
      return;
    }

    await prisma.user.delete({ where: { id: targetId } });
    invalidateUserStatus(targetId);

    await logActivity(req.user!.userId, 'DELETE_USER', 'User', targetId, {
      email: target.email,
      name: target.name,
    });

    res.status(200).json({ message: 'User removed.' });
  } catch (error) {
    console.error('Delete managed user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
