import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { hashPassword } from '../utils/auth';
import { logActivity } from '../utils/logger';
import { hashSecret, publicAppUrl, randomToken, sendMail } from '../utils/mailer';
import { MIN_PASSWORD_LENGTH, normalizeEmail } from '../utils/validation';
import { createOrganization } from '../utils/org';
import { slog } from '../utils/slog';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const roleForActor = (actorRole: string): 'SUBADMIN' | 'TENANT' | 'STAFF' | null => {
  if (actorRole === 'SUPERADMIN') return 'SUBADMIN';
  if (actorRole === 'SUBADMIN') return 'TENANT';
  if (actorRole === 'TENANT') return 'STAFF';
  return null;
};

export const createInvite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = roleForActor(req.user!.role);
    if (!role) {
      res.status(403).json({ message: 'Your role cannot invite other users.' });
      return;
    }

    const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
    if (!email) {
      res.status(400).json({ message: 'A valid email is required.' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ message: 'A user with this email already exists.' });
      return;
    }

    const actor = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true, name: true },
    });

    const token = randomToken();
    const invite = await prisma.invite.create({
      data: {
        email,
        role,
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedById: req.user!.userId,
        parentUserId: req.user!.userId,
        organizationId: role === 'STAFF' ? actor?.organizationId : null,
      },
    });

    const url = `${publicAppUrl()}/accept-invite?token=${token}`;
    await sendMail({
      to: email,
      subject: `You are invited to QuizPulse as ${role}`,
      text: `${actor?.name || 'An admin'} invited you to QuizPulse.\n\nAccept the invite (valid 7 days):\n${url}\n`,
    });

    await logActivity(req.user!.userId, 'INVITE_USER', 'Invite', invite.id, { email, role });

    res.status(201).json({ message: 'Invite sent.', invite: { id: invite.id, email, role, expiresAt: invite.expiresAt } });
  } catch (error) {
    slog('error', 'invite.create_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const acceptInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, name, password } = req.body || {};

    if (typeof token !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
      res.status(400).json({ message: 'Token, name and password are required.' });
      return;
    }

    if (!name.trim() || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ message: `Name is required and password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    const invite = await prisma.invite.findUnique({ where: { tokenHash: hashSecret(token) } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      res.status(400).json({ message: 'This invite is invalid or has expired.' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) {
      res.status(400).json({ message: 'A user with this email already exists.' });
      return;
    }

    let organizationId = invite.organizationId;
    if (invite.role === 'TENANT' && !organizationId) {
      const org = await createOrganization(name.trim());
      organizationId = org.id;
    }

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: invite.email,
        password: await hashPassword(password),
        role: invite.role,
        parentUserId: invite.parentUserId,
        organizationId,
      },
    });

    await prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    res.status(201).json({
      message: 'Account created. You can sign in now.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    slog('error', 'invite.accept_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
