import prisma from '../config/prisma';

/**
 * Ends sessions left "live" by a host who simply closed the tab.
 *
 * A session only stopped being live when the host pressed End. Anything else
 * — a closed laptop, a dropped connection — left it live forever: counted in
 * "Live now", and dropping anyone who joined days later into a stale question.
 * Six hours with no new question and no answer is not a session anyone is
 * still running; a host talking over one untimed question for a long time is
 * covered by the answers still arriving.
 */
export const ABANDONED_AFTER_MS = 6 * 60 * 60 * 1000;

export const endAbandonedSessions = async (now = new Date()): Promise<number> => {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_MS);

  const stale = await prisma.event.findMany({
    where: {
      isLive: true,
      updatedAt: { lt: cutoff },
      // Still answering means still running, however long ago the question moved.
      questions: { none: { responses: { some: { respondedAt: { gte: cutoff } } } } },
    },
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  const { count } = await prisma.event.updateMany({
    where: { id: { in: stale.map((e) => e.id) } },
    data: { isLive: false, currentQuestionId: null, currentQuestionStartedAt: null },
  });
  return count;
};
