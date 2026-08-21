import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';
import { AuthRequest } from '../middleware/auth.middleware';
import { normalizeEmail, MIN_PASSWORD_LENGTH } from '../utils/validation';
import { bumpTokenVersion } from '../utils/userStatus';
import { hashSecret, publicAppUrl, randomToken, sendMail } from '../utils/mailer';
import { slog } from '../utils/slog';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      res.status(400).json({ message: 'Email and password are required.' });
      return;
    }

    let user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });

    if (!user) {
      user = await prisma.user.findFirst({
        where: { email: { equals: email.trim(), mode: 'insensitive' } },
      });
    }

    if (!user) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ message: 'This account has been deactivated. Contact your administrator.' });
      return;
    }

    const token = generateToken(user.id, user.email, user.role, user.tokenVersion);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (error) {
    slog('error', 'auth.login_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        organizationId: true,
        organization: {
          select: { id: true, name: true, plan: true, logoUrl: true, primaryColor: true, slug: true },
        },
      },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    slog('error', 'auth.me_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'Current and new password are required.' });
      return;
    }

    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      res
        .status(400)
        .json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const isPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Current password is incorrect.' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(newPassword) },
    });

    const tokenVersion = await bumpTokenVersion(user.id);
    const token = generateToken(user.id, user.email, user.role, tokenVersion);

    res.status(200).json({ message: 'Password updated successfully.', token });
  } catch (error) {
    slog('error', 'auth.password_change_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';

    // Always 200 so the endpoint cannot be used to probe which emails exist.
    res.status(200).json({ message: 'If that account exists, a reset link is on its way.' });

    if (!email) return;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return;

    const token = randomToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const resetUrl = `${publicAppUrl()}/reset-password?token=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Reset your QuizPulse password',
      text: `Hi ${user.name},\n\nReset your password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you did not ask for this, you can ignore the email.`,
    });
  } catch (error) {
    slog('error', 'auth.forgot_password_failed', { error: error instanceof Error ? error.message : String(error) });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body || {};

    if (typeof token !== 'string' || typeof password !== 'string') {
      res.status(400).json({ message: 'Token and new password are required.' });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashSecret(token) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      res.status(400).json({ message: 'This reset link is invalid or has expired.' });
      return;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { password: await hashPassword(password) },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await bumpTokenVersion(record.userId);

    res.status(200).json({ message: 'Password reset. You can sign in now.' });
  } catch (error) {
    slog('error', 'auth.reset_password_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
