import prisma from '../config/prisma';
import { hashPassword } from './auth';
import { backfillOrganizations } from './org';
import { slog } from './slog';
import { env } from '../config/env';

/**
 * Ensures a SUPERADMIN account exists so the platform is never locked out.
 *
 * Two things were wrong here before. The fallback password `admin@quizpulse`
 * was hardcoded and well known, and the "repair" branch overwrote the password
 * of any existing user holding that email whose role was not SUPERADMIN — so a
 * restart could silently seize an account and reset its credentials.
 */
export const ensureSuperAdmin = async (): Promise<void> => {
  const email = (process.env.SUPERADMIN_EMAIL || 'admin@admin.com').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (!existing) {
      if (!password) {
        // Refuse to create a well-known account rather than creating one and
        // logging a warning nobody reads.
        slog('error', 'bootstrap.superadmin.skipped', {
          reason: 'SUPERADMIN_PASSWORD is not set — refusing to create an account with a default password.',
          email,
        });
        if (env.isProduction) {
          throw new Error(
            'SUPERADMIN_PASSWORD must be set in production. Refusing to boot with a default administrator password.'
          );
        }
        return;
      }

      await prisma.user.create({
        data: {
          name: 'Super Admin',
          email,
          password: await hashPassword(password),
          role: 'SUPERADMIN',
          emailVerifiedAt: new Date(),
        },
      });
      slog('info', 'bootstrap.superadmin.created', { email });
    } else if (existing.role !== 'SUPERADMIN') {
      // Promote, but never touch the password. Rewriting the credentials of an
      // account that already belongs to somebody is an account takeover, not a
      // repair — even when we are the ones doing it.
      await prisma.user.update({ where: { email }, data: { role: 'SUPERADMIN' } });
      slog('warn', 'bootstrap.superadmin.promoted', {
        email,
        note: 'Existing account promoted to SUPERADMIN. Its password was left unchanged.',
      });
    }

    await backfillOrganizations();
  } catch (error) {
    slog('error', 'bootstrap.failed', { error: error instanceof Error ? error.message : String(error) });
    if (env.isProduction) throw error;
  }
};
