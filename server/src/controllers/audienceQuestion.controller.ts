import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ParticipantRequest } from '../middleware/participant.middleware';
import { canAccessEvent } from '../utils/access';
import { liveEvents } from '../utils/liveEvents';
import { slog } from '../utils/slog';

/**
 * Audience Q&A.
 *
 * Slido's free tier caps polls at three per event but leaves Q&A unlimited —
 * a deliberate statement about which feature drives adoption. Questions come
 * from participants, are ranked by upvotes, and can be moderated before the
 * room sees them.
 */

const MAX_QUESTION_LENGTH = 500;

type Viewer = { participantId: string } | { host: true };

/** The shape sent to clients. Never exposes another person's participantId. */
const present = (
  question: {
    id: string;
    text: string;
    authorName: string | null;
    status: string;
    upvoteCount: number;
    answeredAt: Date | null;
    createdAt: Date;
    participantId: string | null;
    votes?: { participantId: string }[];
  },
  viewer: Viewer
) => ({
  id: question.id,
  text: question.text,
  authorName: question.authorName,
  status: question.status,
  upvoteCount: question.upvoteCount,
  answeredAt: question.answeredAt,
  createdAt: question.createdAt,
  hasVoted:
    'participantId' in viewer
      ? Boolean(question.votes?.some((vote) => vote.participantId === viewer.participantId))
      : false,
  isMine: 'participantId' in viewer ? question.participantId === viewer.participantId : false,
});

/** Upvoted first, then newest. */
const ORDER = [{ upvoteCount: 'desc' as const }, { createdAt: 'desc' as const }];

/* ------------------------------ participant ------------------------------ */

export const listForParticipant = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { participantId, eventId } = req.participant!;

    const questions = await prisma.audienceQuestion.findMany({
      where: {
        eventId,
        // A pending question is visible only to its own author, so they can see
        // their submission landed rather than assuming it vanished.
        OR: [{ status: { in: ['APPROVED', 'ANSWERED'] } }, { participantId }],
      },
      orderBy: ORDER,
      include: { votes: { where: { participantId }, select: { participantId: true } } },
      take: 200,
    });

    res.json({ questions: questions.map((question) => present(question, { participantId })) });
  } catch (error) {
    slog('error', 'qa.list_participant_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const submitQuestion = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { participantId, eventId } = req.participant!;
    const { text, anonymous } = req.body || {};

    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ message: 'Type a question first.' });
      return;
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { qaEnabled: true, qaModerated: true },
    });

    if (!event) {
      res.status(404).json({ message: 'Event not found.' });
      return;
    }

    if (!event.qaEnabled) {
      res.status(403).json({ message: 'The host has turned off questions for this session.' });
      return;
    }

    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: { name: true },
    });

    const question = await prisma.audienceQuestion.create({
      data: {
        eventId,
        participantId,
        // An anonymous question keeps no author name at all, rather than
        // storing one and relying on every read path to hide it.
        authorName: anonymous === true ? null : participant?.name?.trim() || null,
        text: text.trim().slice(0, MAX_QUESTION_LENGTH),
        status: event.qaModerated ? 'PENDING' : 'APPROVED',
      },
    });

    liveEvents.emit('qa:changed', { eventId });

    res.status(201).json({
      message: event.qaModerated ? 'Sent to the host for review.' : 'Question posted.',
      question: present({ ...question, votes: [] }, { participantId }),
    });
  } catch (error) {
    slog('error', 'qa.submit_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const toggleUpvote = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { participantId, eventId } = req.participant!;
    const questionId = req.params.id as string;

    const question = await prisma.audienceQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, eventId: true, status: true },
    });

    if (!question || question.eventId !== eventId) {
      res.status(404).json({ message: 'Question not found.' });
      return;
    }

    if (question.status === 'DISMISSED') {
      res.status(400).json({ message: 'This question is no longer open for votes.' });
      return;
    }

    const existing = await prisma.audienceQuestionVote.findUnique({
      where: { audienceQuestionId_participantId: { audienceQuestionId: questionId, participantId } },
    });

    // The vote row is the source of truth; upvoteCount is a denormalised copy
    // kept in the same transaction so the two cannot drift.
    const [, updated] = existing
      ? await prisma.$transaction([
          prisma.audienceQuestionVote.delete({ where: { id: existing.id } }),
          prisma.audienceQuestion.update({
            where: { id: questionId },
            data: { upvoteCount: { decrement: 1 } },
          }),
        ])
      : await prisma.$transaction([
          prisma.audienceQuestionVote.create({
            data: { audienceQuestionId: questionId, participantId },
          }),
          prisma.audienceQuestion.update({
            where: { id: questionId },
            data: { upvoteCount: { increment: 1 } },
          }),
        ]);

    liveEvents.emit('qa:changed', { eventId });

    res.json({ upvoteCount: updated.upvoteCount, hasVoted: !existing });
  } catch (error) {
    slog('error', 'qa.upvote_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/* --------------------------------- host --------------------------------- */

const assertHostAccess = async (req: AuthRequest, eventId: string) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { hostId: true, qaModerated: true, qaEnabled: true },
  });
  if (!event) return null;
  const allowed = await canAccessEvent(req.user!.userId, req.user!.role, event.hostId);
  return allowed ? event : null;
};

export const listForHost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;
    const event = await assertHostAccess(req, eventId);

    if (!event) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    // The host sees everything, including PENDING and DISMISSED.
    const questions = await prisma.audienceQuestion.findMany({
      where: { eventId },
      orderBy: ORDER,
      take: 500,
    });

    res.json({
      questions: questions.map((question) => present(question, { host: true })),
      qaEnabled: event.qaEnabled,
      qaModerated: event.qaModerated,
    });
  } catch (error) {
    slog('error', 'qa.list_host_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

const ALLOWED_STATUS = ['APPROVED', 'ANSWERED', 'DISMISSED', 'PENDING'] as const;
type AllowedStatus = (typeof ALLOWED_STATUS)[number];

export const moderateQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const questionId = req.params.id as string;
    const status = req.body?.status as AllowedStatus;

    if (!ALLOWED_STATUS.includes(status)) {
      res.status(400).json({ message: `Status must be one of ${ALLOWED_STATUS.join(', ')}.` });
      return;
    }

    const question = await prisma.audienceQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, eventId: true },
    });

    if (!question || !(await assertHostAccess(req, question.eventId))) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    const updated = await prisma.audienceQuestion.update({
      where: { id: questionId },
      data: { status, answeredAt: status === 'ANSWERED' ? new Date() : null },
    });

    liveEvents.emit('qa:changed', { eventId: question.eventId });

    res.json({ message: 'Question updated.', question: present(updated, { host: true }) });
  } catch (error) {
    slog('error', 'qa.moderate_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateQaSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;
    if (!(await assertHostAccess(req, eventId))) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    const { qaEnabled, qaModerated } = req.body || {};
    const data: { qaEnabled?: boolean; qaModerated?: boolean } = {};
    if (typeof qaEnabled === 'boolean') data.qaEnabled = qaEnabled;
    if (typeof qaModerated === 'boolean') data.qaModerated = qaModerated;

    if (Object.keys(data).length === 0) {
      res.status(400).json({ message: 'Nothing to update.' });
      return;
    }

    const event = await prisma.event.update({ where: { id: eventId }, data });
    liveEvents.emit('qa:changed', { eventId });

    res.json({
      message: 'Q&A settings updated.',
      qaEnabled: event.qaEnabled,
      qaModerated: event.qaModerated,
    });
  } catch (error) {
    slog('error', 'qa.settings_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
