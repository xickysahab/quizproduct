import prisma from '../config/prisma';
import { hashPassword } from './auth';
import { backfillOrganizations } from './org';
import { slog } from './slog';

/**
 * Ensures a SUPERADMIN account exists so the platform is never locked out.
 * Configure via SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD env vars.
 */
export const ensureSuperAdmin = async (): Promise<void> => {
  const email = process.env.SUPERADMIN_EMAIL || 'admin@admin.com';
  const password = process.env.SUPERADMIN_PASSWORD || 'admin@quizpulse';

  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (!existing) {
      await prisma.user.create({
        data: {
          name: 'Super Admin',
          email,
          password: await hashPassword(password),
          role: 'SUPERADMIN',
        },
      });
      slog('info', 'bootstrap.superadmin.created', { email });
    } else if (existing.role !== 'SUPERADMIN') {
      await prisma.user.update({
        where: { email },
        data: { role: 'SUPERADMIN', password: await hashPassword(password) },
      });
      slog('info', 'bootstrap.superadmin.repaired', { email });
    }

    await backfillOrganizations();
  } catch (error) {
    slog('error', 'bootstrap.failed', { error: error instanceof Error ? error.message : String(error) });
  }
};
