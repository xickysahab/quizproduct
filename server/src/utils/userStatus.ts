import prisma from '../config/prisma';

const CACHE_TTL_MS = 60_000;

interface CachedStatus {
  isActive: boolean;
  tokenVersion: number;
  expiresAt: number;
}

const cache = new Map<string, CachedStatus>();

export const getUserAuthState = async (
  userId: string
): Promise<{ isActive: boolean; tokenVersion: number } | null> => {
  const cached = cache.get(userId);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return { isActive: cached.isActive, tokenVersion: cached.tokenVersion };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, tokenVersion: true },
  });

  if (!user) {
    cache.set(userId, { isActive: false, tokenVersion: 0, expiresAt: now + CACHE_TTL_MS });
    return null;
  }

  cache.set(userId, {
    isActive: user.isActive,
    tokenVersion: user.tokenVersion,
    expiresAt: now + CACHE_TTL_MS,
  });

  return { isActive: user.isActive, tokenVersion: user.tokenVersion };
};

export const isUserActive = async (userId: string): Promise<boolean> => {
  const state = await getUserAuthState(userId);
  return state?.isActive ?? false;
};

export const invalidateUserStatus = (userId: string): void => {
  cache.delete(userId);
};

export const bumpTokenVersion = async (userId: string): Promise<number> => {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  invalidateUserStatus(userId);
  return updated.tokenVersion;
};
