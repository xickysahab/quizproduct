import prisma from '../config/prisma';

/**
 * Returns the list of host user IDs whose events this user is allowed to see/manage.
 * Returns null for SUPERADMIN, meaning "all hosts".
 *
 * Hierarchy: SUPERADMIN > SUBADMIN > TENANT > STAFF (via User.parentUserId)
 */
export const getAccessibleHostIds = async (userId: string, role: string): Promise<string[] | null> => {
  if (role === 'SUPERADMIN') return null;

  if (role === 'STAFF') return [userId];

  if (role === 'TENANT') {
    const staff = await prisma.user.findMany({
      where: { parentUserId: userId },
      select: { id: true },
    });
    return [userId, ...staff.map((s) => s.id)];
  }

  // SUBADMIN: self + their tenants + staff under those tenants
  const tenants = await prisma.user.findMany({
    where: { parentUserId: userId },
    select: { id: true },
  });
  const tenantIds = tenants.map((t) => t.id);

  const staff = tenantIds.length
    ? await prisma.user.findMany({
        where: { parentUserId: { in: tenantIds } },
        select: { id: true },
      })
    : [];

  return [userId, ...tenantIds, ...staff.map((s) => s.id)];
};

/** True if the user owns the event or is an ancestor (or SUPERADMIN). */
export const canAccessEvent = async (userId: string, role: string, eventHostId: string): Promise<boolean> => {
  const hostIds = await getAccessibleHostIds(userId, role);
  return hostIds === null || hostIds.includes(eventHostId);
};

/**
 * True if the actor may rename, deactivate, reset or remove the target user.
 * Management follows the same subtree as visibility, with one exception: nobody
 * manages themselves, so an admin cannot lock themselves out of their own
 * account.
 */
export const canManageUser = async (
  actorId: string,
  actorRole: string,
  targetUserId: string
): Promise<boolean> => {
  if (actorId === targetUserId) return false;

  const manageableIds = await getAccessibleHostIds(actorId, actorRole);
  return manageableIds === null || manageableIds.includes(targetUserId);
};
