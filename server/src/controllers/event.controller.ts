import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { generateRoomCode } from '../utils/roomCode';
import { logActivity } from '../utils/logger';
import { getAccessibleHostIds, canAccessEvent } from '../utils/access';
import { parsePagination } from '../utils/validation';
import { organizationIdForUser } from '../utils/org';
import { assertCanCreateEvent, releaseEventSlot } from '../utils/usage';
import { slog } from '../utils/slog';
import { hashSecret } from '../utils/mailer';

const uniqueRoomCode = async (): Promise<string> => {
  let roomCode = generateRoomCode();
  let existingRoom = await prisma.event.findUnique({ where: { roomCode } });
  while (existingRoom) {
    roomCode = generateRoomCode();
    existingRoom = await prisma.event.findUnique({ where: { roomCode } });
  }
  return roomCode;
};

export const createEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title } = req.body;
    const hostId = req.user?.userId;

    if (!title) {
      res.status(400).json({ message: 'Event title is required.' });
      return;
    }

    if (!hostId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const organizationId = await organizationIdForUser(hostId);
    const allowed = await assertCanCreateEvent(organizationId);
    if (!allowed.ok) {
      res.status(402).json({ message: allowed.message });
      return;
    }

    let event;
    try {
      event = await prisma.event.create({
        data: {
          title,
          roomCode: await uniqueRoomCode(),
          hostId,
          organizationId,
        },
      });
    } catch (creationError) {
      // The quota slot was reserved before the insert; hand it back rather
      // than charging the org for an event that never existed.
      await releaseEventSlot(organizationId);
      throw creationError;
    }

    // The slot was already reserved by assertCanCreateEvent — bumping again
    // here would count every event twice against the monthly quota.
    await logActivity(req.user?.userId, 'CREATE_EVENT', 'Event', event.id, { title: event.title, roomCode: event.roomCode });

    res.status(201).json({
      message: 'Event created successfully',
      event,
    });
  } catch (error) {
    slog('error', 'event.create_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getHostEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, role } = req.user!;

    // Scope events to the user's hierarchy (SUPERADMIN sees all)
    const hostIds = await getAccessibleHostIds(userId, role);
    const where = hostIds === null ? undefined : { hostId: { in: hostIds } };

    const { skip, take, page, limit } = parsePagination(req.query, {
      defaultLimit: 60,
      maxLimit: 200,
    });

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          host: {
            select: { id: true, name: true, email: true, role: true },
          },
          _count: {
            select: { questions: true, participants: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.event.count({ where }),
    ]);

    res.status(200).json({
      events,
      pagination: { page, limit, total, hasMore: skip + events.length < total },
    });
  } catch (error) {
    console.error('Get host events error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getEventById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { participants: true },
        },
      },
    });

    if (!event) {
      res.status(404).json({ message: 'Event not found' });
      return;
    }

    const allowed = await canAccessEvent(req.user!.userId, req.user!.role, event.hostId);
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden: You do not have access to this event.' });
      return;
    }

    res.status(200).json({ event });
  } catch (error) {
    console.error('Get event by ID error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const event = await prisma.event.findUnique({ where: { id } });

    if (!event) {
      res.status(404).json({ message: 'Event not found' });
      return;
    }

    const allowed = await canAccessEvent(req.user!.userId, req.user!.role, event.hostId);
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden: You can only delete events in your organization.' });
      return;
    }

    await prisma.event.delete({ where: { id } });

    await logActivity(req.user?.userId, 'DELETE_EVENT', 'Event', id, { title: event.title });

    res.status(200).json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateEventConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { concludeConfig } = req.body;

    const event = await prisma.event.findUnique({ where: { id } });

    if (!event) {
      res.status(404).json({ message: 'Event not found' });
      return;
    }

    const allowed = await canAccessEvent(req.user!.userId, req.user!.role, event.hostId);
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden: You do not have access to this event.' });
      return;
    }

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: { concludeConfig },
    });

    await logActivity(req.user?.userId, 'UPDATE_EVENT_CONFIG', 'Event', id, { title: event.title });

    res.status(200).json({ message: 'Event config updated successfully', event: updatedEvent });
  } catch (error) {
    console.error('Update event config error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const clearEventData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      res.status(404).json({ message: 'Event not found' });
      return;
    }

    const allowed = await canAccessEvent(req.user!.userId, req.user!.role, event.hostId);
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden: You can only clear data for events in your organization.' });
      return;
    }

    // Delete participants. Because of onDelete: Cascade in schema, this will automatically delete all Responses.
    await prisma.participant.deleteMany({ where: { eventId: id } });

    // Reset the whole live-session pointer, not just the question. Leaving
    // isLive true with a stale start time meant a re-run began mid-question
    // with a deadline that had already expired.
    await prisma.event.update({
      where: { id },
      data: { currentQuestionId: null, currentQuestionStartedAt: null, isLive: false },
    });

    await logActivity(req.user?.userId, 'CLEAR_EVENT_DATA', 'Event', id, { title: event.title });

    res.status(200).json({ message: 'Quiz data cleared successfully' });
  } catch (error) {
    console.error('Clear event data error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const duplicateEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const hostId = req.user!.userId;

    const source = await prisma.event.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!source) {
      res.status(404).json({ message: 'Event not found' });
      return;
    }

    const allowed = await canAccessEvent(hostId, req.user!.role, source.hostId);
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden: You do not have access to this event.' });
      return;
    }

    const organizationId = await organizationIdForUser(hostId);
    const quota = await assertCanCreateEvent(organizationId);
    if (!quota.ok) {
      res.status(402).json({ message: quota.message });
      return;
    }

    const copy = await prisma.event.create({
      data: {
        title: `${source.title} (copy)`,
        roomCode: await uniqueRoomCode(),
        hostId,
        organizationId,
        concludeConfig: source.concludeConfig ?? undefined,
        questions: {
          create: source.questions.map((question) => ({
            type: question.type,
            text: question.text,
            options: question.options,
            correctOption: question.correctOption,
            correctOptions: question.correctOptions,
            order: question.order,
            timeLimit: question.timeLimit,
          })),
        },
      },
      include: { questions: true },
    });

    await logActivity(hostId, 'DUPLICATE_EVENT', 'Event', copy.id, {
      sourceId: source.id,
      title: copy.title,
    });

    res.status(201).json({ message: 'Quiz duplicated', event: copy });
  } catch (error) {
    slog('error', 'event.duplicate_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Sets or clears the room passcode, and the anonymity switch.
 *
 * A passcode is a door code shared with a room, not a credential — it is stored
 * hashed so a database dump does not hand out access to every live session, but
 * it is not pretending to resist offline cracking.
 */
export const updateEventAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { passcode, allowAnonymous, retireCode } = req.body || {};

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      res.status(404).json({ message: 'Event not found' });
      return;
    }

    if (!(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden: You do not have access to this event.' });
      return;
    }

    const data: { passcodeHash?: string | null; allowAnonymous?: boolean; roomCodeRetiredAt?: Date | null } = {};

    if (passcode !== undefined) {
      const value = typeof passcode === 'string' ? passcode.trim() : '';
      if (value && value.length < 4) {
        res.status(400).json({ message: 'A passcode needs at least 4 characters.' });
        return;
      }
      // Lowercased before hashing so the room does not fail on capitalisation
      // when the code is read off a slide.
      data.passcodeHash = value ? hashSecret(value.toLowerCase()) : null;
    }

    if (typeof allowAnonymous === 'boolean') data.allowAnonymous = allowAnonymous;
    if (typeof retireCode === 'boolean') data.roomCodeRetiredAt = retireCode ? new Date() : null;

    if (Object.keys(data).length === 0) {
      res.status(400).json({ message: 'Nothing to update.' });
      return;
    }

    const updated = await prisma.event.update({ where: { id }, data });

    await logActivity(req.user?.userId, 'UPDATE_EVENT_ACCESS', 'Event', id, {
      title: event.title,
      passcodeSet: Boolean(updated.passcodeHash),
      retired: Boolean(updated.roomCodeRetiredAt),
    });

    res.json({
      message: 'Access settings updated.',
      // Never echo the passcode back, only whether one is set.
      passcodeSet: Boolean(updated.passcodeHash),
      allowAnonymous: updated.allowAnonymous,
      roomCodeRetiredAt: updated.roomCodeRetiredAt,
    });
  } catch (error) {
    slog('error', 'event.access_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Public pre-join lookup, so the join screen can ask for a passcode and show
 * the host's branding before anybody is admitted. Deliberately minimal — it
 * must not leak the session's content to someone who has only guessed a code.
 */
export const getPublicEventInfo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = String(req.params.code || '').replace(/[\s-]+/g, '').toUpperCase();

    const event = await prisma.event.findUnique({
      where: { roomCode: code },
      select: {
        title: true,
        allowAnonymous: true,
        passcodeHash: true,
        roomCodeRetiredAt: true,
        organization: { select: { name: true, logoUrl: true, primaryColor: true } },
      },
    });

    if (!event || event.roomCodeRetiredAt) {
      res.status(404).json({ message: 'That code did not match a room.' });
      return;
    }

    res.json({
      title: event.title,
      allowAnonymous: event.allowAnonymous,
      passcodeRequired: Boolean(event.passcodeHash),
      branding: event.organization
        ? {
            name: event.organization.name,
            logoUrl: event.organization.logoUrl,
            primaryColor: event.organization.primaryColor,
          }
        : null,
    });
  } catch (error) {
    slog('error', 'event.public_info_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
