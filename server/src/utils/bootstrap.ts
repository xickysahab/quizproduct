import prisma from '../config/prisma';
import { hashPassword } from './auth';

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
      console.log(`✅ SuperAdmin account created: ${email}`);
    } else if (existing.role !== 'SUPERADMIN') {
      // Repair accounts created by the old broken bootstrap flow (wrong role/password)
      await prisma.user.update({
        where: { email },
        data: { role: 'SUPERADMIN', password: await hashPassword(password) },
      });
      console.log(`✅ SuperAdmin role repaired for: ${email}`);
    }

    if (!process.env.SUPERADMIN_PASSWORD) {
      console.warn('⚠️  Using default SuperAdmin password. Set SUPERADMIN_PASSWORD in .env for production.');
    }
  } catch (error) {
    console.error('Failed to ensure SuperAdmin account:', error);
  }
};
