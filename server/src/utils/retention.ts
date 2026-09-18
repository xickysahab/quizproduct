import prisma from '../config/prisma';
import { RETENTION_DAYS } from './consent';
import { slog } from './slog';

/**
 * Erasure, on a schedule.
 *
 * /legal/company publishes RETENTION_DAYS to anyone who asks, and DPDP §8(7)
 * requires personal data to be erased once the purpose it was collected for is
 * served. Publishing a window and never enforcing it is worse than publishing
 * nothing: it is a stated commitment the system does not keep.
 *
 * What ages out is the personal data, not the host's work. A participant row is
 * a name somebody typed on their phone and the answers they gave; the event,
 * its title and its questions belong to the host and stay. So the sweep deletes
 * participants and lets responses cascade, rather than deleting sessions.
 */

/**
 * The most rows this will delete from any one table in a single run.
 *
 * A deletion job with no ceiling is one bug away from emptying a table, and the
 * person who would notice is asleep. At a daily cadence this still clears far
 * more than a busy month generates, while keeping any single mistake to
 * something a backup can undo.
 */
const MAX_PER_TABLE_PER_RUN = 5_000;

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** Deletes at most MAX_PER_TABLE_PER_RUN rows, chosen by id so the cap is real. */
const deleteCapped = async (
  find: (take: number) => Promise<{ id: string }[]>,
  remove: (ids: string[]) => Promise<{ count: number }>
): Promise<number> => {
  const doomed = await find(MAX_PER_TABLE_PER_RUN);
  if (doomed.length === 0) return 0;
  const { count } = await remove(doomed.map((row) => row.id));
  return count;
};

export interface RetentionResult {
  participants: number;
  activityLogs: number;
  tokens: number;
}

export const sweepRetention = async (): Promise<RetentionResult> => {
  const sessionCutoff = daysAgo(RETENTION_DAYS.sessionData);
  const logCutoff = daysAgo(RETENTION_DAYS.activityLogs);
  const tokenCutoff = daysAgo(RETENTION_DAYS.tokens);

  // Responses, and the answers inside them, cascade from the participant.
  // A live event is excluded on principle rather than probability: a session
  // running past its own retention window is someone's bad day, not ours to
  // make worse by deleting the room out from under it.
  const participants = await deleteCapped(
    (take) =>
      prisma.participant.findMany({
        where: { joinedAt: { lt: sessionCutoff }, event: { isLive: false } },
        select: { id: true },
        take,
      }),
    (ids) => prisma.participant.deleteMany({ where: { id: { in: ids } } })
  );

  const activityLogs = await deleteCapped(
    (take) =>
      prisma.activityLog.findMany({
        where: { createdAt: { lt: logCutoff } },
        select: { id: true },
        take,
      }),
    (ids) => prisma.activityLog.deleteMany({ where: { id: { in: ids } } })
  );

  // Only tokens that can no longer do anything: already used, or long expired.
  // A token still inside its window is live credential material and is left be,
  // however old the row is.
  const spent = { createdAt: { lt: tokenCutoff } };
  const dead = (cutoff: Date) => ({ OR: [{ usedAt: { not: null } }, { expiresAt: { lt: cutoff } }] });

  const resets = await deleteCapped(
    (take) =>
      prisma.passwordResetToken.findMany({
        where: { AND: [spent, dead(new Date())] },
        select: { id: true },
        take,
      }),
    (ids) => prisma.passwordResetToken.deleteMany({ where: { id: { in: ids } } })
  );

  const verifications = await deleteCapped(
    (take) =>
      prisma.emailVerificationToken.findMany({
        where: { AND: [spent, dead(new Date())] },
        select: { id: true },
        take,
      }),
    (ids) => prisma.emailVerificationToken.deleteMany({ where: { id: { in: ids } } })
  );

  const invites = await deleteCapped(
    (take) =>
      prisma.invite.findMany({
        where: { AND: [spent, { expiresAt: { lt: new Date() } }] },
        select: { id: true },
        take,
      }),
    (ids) => prisma.invite.deleteMany({ where: { id: { in: ids } } })
  );

  const result = { participants, activityLogs, tokens: resets + verifications + invites };

  // Logged even when it deletes nothing, because "the sweep ran" is the thing
  // worth being able to confirm after the fact.
  slog('info', 'retention.sweep_completed', { ...result, capPerTable: MAX_PER_TABLE_PER_RUN });

  return result;
};
