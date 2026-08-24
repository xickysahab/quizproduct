import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { hashSecret } from '../utils/mailer';
import { normalizeEmail } from '../utils/validation';
import { slog } from '../utils/slog';
import { logActivity } from '../utils/logger';
import { CONSENT_PURPOSES, POLICY_VERSION, isKnownPurpose } from '../utils/consent';
import { canAccessEvent } from '../utils/access';

/**
 * DPDP Act 2023 compliance.
 *
 * Every organisation processing the digital personal data of people in India is
 * a Data Fiduciary. Three duties are implemented here: itemised consent (§6),
 * the right to erasure (§12), and a retention limit (§8(7)). Penalties run to
 * ₹250 crore per instance, so "we will harden this later" is not a position.
 */

/** The purposes a person can consent to, and what each one actually covers. */
export const listPurposes = async (_req: Request, res: Response): Promise<void> => {
  res.json({ policyVersion: POLICY_VERSION, purposes: CONSENT_PURPOSES });
};

/**
 * Records consent, one row per purpose.
 *
 * DPDP §6 requires consent to be specific and unambiguous, and each purpose
 * consented to separately — a single bundled checkbox does not satisfy it.
 */
export const recordConsent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { consents } = req.body || {};

    if (!Array.isArray(consents) || consents.length === 0) {
      res.status(400).json({ message: 'A list of consent decisions is required.' });
      return;
    }

    const invalid = consents.find(
      (entry: { purpose?: unknown; granted?: unknown }) =>
        typeof entry?.purpose !== 'string' ||
        !isKnownPurpose(entry.purpose) ||
        typeof entry?.granted !== 'boolean'
    );

    if (invalid) {
      res.status(400).json({ message: 'Each entry needs a known purpose and a true/false decision.' });
      return;
    }

    const userId = req.user?.userId ?? null;

    await prisma.$transaction(
      consents.map((entry: { purpose: string; granted: boolean }) =>
        prisma.consentRecord.create({
          data: {
            userId,
            purpose: entry.purpose,
            granted: entry.granted,
            // The wording shown at the time, so consent can be evidenced later.
            policyVersion: POLICY_VERSION,
            withdrawnAt: entry.granted ? null : new Date(),
          },
        })
      )
    );

    res.status(201).json({ message: 'Choices saved.', policyVersion: POLICY_VERSION });
  } catch (error) {
    slog('error', 'privacy.consent_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/** The person's current decision per purpose — the latest row for each. */
export const getMyConsents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const records = await prisma.consentRecord.findMany({
      where: { userId: req.user!.userId },
      orderBy: { grantedAt: 'desc' },
    });

    const latest = new Map<string, (typeof records)[number]>();
    records.forEach((record) => {
      if (!latest.has(record.purpose)) latest.set(record.purpose, record);
    });

    res.json({
      policyVersion: POLICY_VERSION,
      consents: CONSENT_PURPOSES.map((purpose) => ({
        ...purpose,
        granted: latest.get(purpose.key)?.granted ?? false,
        decidedAt: latest.get(purpose.key)?.grantedAt ?? null,
      })),
    });
  } catch (error) {
    slog('error', 'privacy.get_consent_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Right to erasure (§12).
 *
 * A hard purge, not a soft flag. Cascades already remove responses, votes and
 * audience questions; the counts are recorded so the erasure can be evidenced
 * without keeping any of the data.
 */
export const requestDeletion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, organizationId: true },
    });

    if (!user) {
      res.status(404).json({ message: 'Account not found.' });
      return;
    }

    // A SUPERADMIN deleting itself would lock the platform out entirely.
    if (user.role === 'SUPERADMIN') {
      res.status(400).json({
        message: 'A platform owner account cannot be erased through this route. Transfer ownership first.',
      });
      return;
    }

    const request = await prisma.dataDeletionRequest.create({
      data: { userId, emailHash: hashSecret(normalizeEmail(user.email)), status: 'IN_PROGRESS' },
    });

    const events = await prisma.event.findMany({ where: { hostId: userId }, select: { id: true } });
    const eventIds = events.map((event) => event.id);

    const [participants, responses, audienceQuestions] = await Promise.all([
      prisma.participant.count({ where: { eventId: { in: eventIds } } }),
      prisma.response.count({ where: { participant: { eventId: { in: eventIds } } } }),
      prisma.audienceQuestion.count({ where: { eventId: { in: eventIds } } }),
    ]);

    // Deleting the events cascades to participants, responses, questions,
    // audience questions and votes. Deleting the user cascades to consent
    // records, reset tokens and activity logs.
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { hostId: userId } }),
      prisma.user.delete({ where: { id: userId } }),
      prisma.dataDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          userId: null,
          summary: { events: eventIds.length, participants, responses, audienceQuestions },
        },
      }),
    ]);

    slog('info', 'privacy.account_erased', { requestId: request.id, events: eventIds.length });

    res.json({
      message: 'Your account and its session data have been permanently deleted.',
      reference: request.id,
      erased: { events: eventIds.length, participants, responses, audienceQuestions },
    });
  } catch (error) {
    slog('error', 'privacy.deletion_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Could not complete the deletion. Nothing was removed.' });
  }
};

/**
 * Erases the personal data of one session's participants while keeping the
 * aggregate results. Names are the only personal data a participant supplies,
 * so clearing them anonymises the record without destroying the host's report.
 */
export const anonymiseEventParticipants = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hostId: true, title: true },
    });

    if (!event) {
      res.status(404).json({ message: 'Event not found' });
      return;
    }

    if (!(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden: You do not have access to this event.' });
      return;
    }

    const [participants, questions] = await Promise.all([
      prisma.participant.updateMany({ where: { eventId }, data: { name: '', sessionKey: null } }),
      prisma.audienceQuestion.updateMany({ where: { eventId }, data: { authorName: null } }),
    ]);

    await logActivity(req.user?.userId, 'ANONYMISE_EVENT', 'Event', eventId, {
      title: event.title,
      participants: participants.count,
    });

    res.json({
      message: 'Participant names removed. Results and counts are unchanged.',
      anonymised: { participants: participants.count, audienceQuestions: questions.count },
    });
  } catch (error) {
    slog('error', 'privacy.anonymise_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
