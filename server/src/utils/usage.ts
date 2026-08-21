import prisma from '../config/prisma';
import { currentPeriod, limitsFor, PlanName } from './plans';

export const bumpUsage = async (
  organizationId: string | null | undefined,
  field: 'eventsCreated' | 'participantsJoined',
  by = 1
): Promise<void> => {
  if (!organizationId) return;

  const period = currentPeriod();
  await prisma.usageMeter.upsert({
    where: { organizationId_period: { organizationId, period } },
    create: { organizationId, period, [field]: by },
    update: { [field]: { increment: by } },
  });
};

export const assertCanCreateEvent = async (
  organizationId: string | null | undefined
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (!organizationId) return { ok: true };

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });
  const limits = limitsFor(org?.plan as PlanName);
  const period = currentPeriod();
  const meter = await prisma.usageMeter.findUnique({
    where: { organizationId_period: { organizationId, period } },
  });

  if ((meter?.eventsCreated || 0) >= limits.eventsPerMonth) {
    return {
      ok: false,
      message: `This ${org?.plan || 'FREE'} plan allows ${limits.eventsPerMonth} quizzes this month. Upgrade to create more.`,
    };
  }

  return { ok: true };
};

export const participantCapForOrg = async (
  organizationId: string | null | undefined,
  globalCap: number
): Promise<number> => {
  if (!organizationId) return globalCap;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });
  const planCap = limitsFor(org?.plan as PlanName).participantsPerEvent;
  return Math.min(planCap, globalCap);
};

export const assertCanAddQuestion = async (
  organizationId: string | null | undefined,
  currentCount: number
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (!organizationId) return { ok: true };

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });
  const limits = limitsFor(org?.plan as PlanName);

  if (currentCount >= limits.questionsPerEvent) {
    return {
      ok: false,
      message: `This ${org?.plan || 'FREE'} plan allows ${limits.questionsPerEvent} questions per quiz.`,
    };
  }

  return { ok: true };
};
