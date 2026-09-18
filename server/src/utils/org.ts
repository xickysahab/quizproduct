import crypto from 'crypto';
import prisma from '../config/prisma';

const makeOrgSlug = (name: string): string => {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
};

export const createOrganization = async (name: string) =>
  prisma.organization.create({
    data: { name, slug: makeOrgSlug(name) },
  });

/**
 * Tenants created before Organization existed have no org row. Attach one so
 * plan limits and branding have somewhere to live, without touching logins.
 */
export const backfillOrganizations = async (): Promise<void> => {
  const tenants = await prisma.user.findMany({
    where: { role: 'TENANT', organizationId: null },
    select: { id: true, name: true },
  });

  for (const tenant of tenants) {
    const org = await createOrganization(tenant.name);
    await prisma.user.update({
      where: { id: tenant.id },
      data: { organizationId: org.id },
    });
    await prisma.user.updateMany({
      where: { parentUserId: tenant.id, organizationId: null },
      data: { organizationId: org.id },
    });
    await prisma.event.updateMany({
      where: { hostId: tenant.id, organizationId: null },
      data: { organizationId: org.id },
    });
  }
};

export const organizationIdForUser = async (userId: string): Promise<string | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  return user?.organizationId ?? null;
};
