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
import {
  SWITCH_KEYS,
  presetSwitches,
  isKnownPreset,
  matchPreset,
  resolveSwitches,
  describeQuestionRisks,
  deriveSessionMode,
  PRESETS,
} from '../utils/sessionSettings';
import type { SessionSwitches, SessionPreset } from '../utils/sessionSettings';
import { STARTER_TEMPLATES, getStarterTemplate } from '../utils/starterTemplates';

const uniqueRoomCode = async (): Promise<string> => {
  let roomCode = generateRoomCode();
  let existingRoom = await prisma.event.findUnique({ where: { roomCode } });
  while (existingRoom) {
    roomCode = generateRoomCode();
    existingRoom = await prisma.event.findUnique({ where: { roomCode } });
  }
  return roomCode;
};

export const listStarterTemplates = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({
    templates: STARTER_TEMPLATES.map(({ id, title, description, questions, sessionMode }) => ({
      id,
      title,
      description,
      questionCount: questions.length,
      sessionMode,
    })),
  });
};

export const createEventFromTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const templateId = String(req.body?.templateId || '');
    const hostId = req.user?.userId;
    if (!hostId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const template = getStarterTemplate(templateId);
    if (!template) {
      res.status(404).json({ message: 'Template not found.' });
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
          title: template.title,
          roomCode: await uniqueRoomCode(),
          hostId,
          organizationId,
          sessionMode: template.sessionMode,
          // Knowledge-check decks benefit from Kahoot-style speed scoring.
          speedBonusEnabled: template.sessionMode === 'QUIZ' && templateId === 'knowledge-check',
          questions: {
            create: template.questions.map((question) => ({
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
        include: { questions: { orderBy: { order: 'asc' } } },
      });
    } catch (creationError) {
      await releaseEventSlot(organizationId);
      throw creationError;
    }

    await logActivity(hostId, 'CREATE_EVENT_FROM_TEMPLATE', 'Event', event.id, {
      templateId,
      title: event.title,
    });

    res.status(201).json({ message: 'Quiz created from template', event });
  } catch (error) {
    slog('error', 'event.template_create_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ message: 'Internal server error' });
  }
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

    // Never send the passcode hash to the browser — only whether one is set.
    const { passcodeHash, ...safeEvent } = event;

    res.status(200).json({
      event: {
        ...safeEvent,
        passcodeSet: Boolean(passcodeHash),
      },
    });
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
        speedBonusEnabled: source.speedBonusEnabled,
        sessionMode: source.sessionMode,
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
/**
 * Reads the switches off an event row.
 * `sessionMode` is deliberately absent — it is derived, never read.
 */
const switchesOf = (event: Record<string, unknown>): SessionSwitches =>
  Object.fromEntries(SWITCH_KEYS.map((key) => [key, event[key]])) as unknown as SessionSwitches;

/**
 * The session's personality: apply a preset, or set individual switches.
 *
 * Presets and switches go through the same endpoint on purpose. A preset is
 * only a bundle — applying one writes switches, and touching any switch
 * afterwards moves the session to CUSTOM. There is no second source of truth.
 */
export const updateEventAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { passcode, retireCode, preset, ...rest } = req.body || {};

    const event = await prisma.event.findUnique({
      where: { id },
      include: { questions: { select: { timeLimit: true } } },
    });

    if (!event) {
      res.status(404).json({ message: 'Event not found' });
      return;
    }

    if (!(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden: You do not have access to this event.' });
      return;
    }

    const data: Record<string, unknown> = {};

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

    if (typeof retireCode === 'boolean') {
      data.roomCodeRetiredAt = retireCode ? new Date() : null;
    }

    // Start from what the session already is, then layer the preset (if one was
    // named) and then any explicit switches on top. Order matters: an explicit
    // switch sent alongside a preset should win.
    let next: SessionSwitches = switchesOf(event as unknown as Record<string, unknown>);
    let requestedPreset: SessionPreset | null = null;

    if (typeof preset === 'string') {
      if (!isKnownPreset(preset)) {
        res.status(400).json({ message: 'Unknown preset.' });
        return;
      }
      requestedPreset = preset;
      const bundle = presetSwitches(preset);
      if (bundle) next = bundle;
    }

    let touchedASwitch = false;
    for (const key of SWITCH_KEYS) {
      const value = (rest as Record<string, unknown>)[key];
      if (value === undefined) continue;
      // Trust the type, not the caller: a bad value is ignored rather than
      // written, so a stale client cannot corrupt the session's personality.
      const expected = typeof next[key];
      if (typeof value !== expected) continue;
      (next as unknown as Record<string, unknown>)[key] = value;
      touchedASwitch = true;
    }

    // Impossible combinations are corrected here, not in the UI — the UI can
    // be stale or bypassed entirely.
    const { switches, conflicts } = resolveSwitches(next);

    // A preset that was applied and then modified is no longer that preset.
    const effectivePreset =
      requestedPreset && !touchedASwitch ? requestedPreset : matchPreset(switches);

    SWITCH_KEYS.forEach((key) => {
      data[key] = switches[key];
    });
    data.preset = effectivePreset;
    // Legacy column, kept in step so the ~80 places that read it stay correct.
    data.sessionMode = deriveSessionMode(switches.scoringEnabled);

    if (Object.keys(data).length === 0) {
      res.status(400).json({ message: 'Nothing to update.' });
      return;
    }

    const updated = await prisma.event.update({ where: { id }, data });

    await logActivity(req.user?.userId, 'UPDATE_EVENT_ACCESS', 'Event', id, {
      title: event.title,
      preset: effectivePreset,
      passcodeSet: Boolean(updated.passcodeHash),
      retired: Boolean(updated.roomCodeRetiredAt),
    });

    res.json({
      message: 'Session settings updated.',
      preset: updated.preset,
      // Never echo the passcode back, only whether one is set.
      passcodeSet: Boolean(updated.passcodeHash),
      roomCodeRetiredAt: updated.roomCodeRetiredAt,
      sessionMode: updated.sessionMode,
      switches,
      // What was corrected and what merely looks odd, so the host is told
      // rather than left wondering why a toggle moved.
      conflicts,
      risks: describeQuestionRisks(switches, event.questions),
    });
  } catch (error) {
    slog('error', 'event.access_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/** The preset catalogue, so the host UI does not hardcode the bundles. */
export const listPresets = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({
    presets: [
      {
        id: 'DISCUSSION',
        label: 'Discussion',
        blurb: 'Audience Q&A leads. Nothing is scored and nobody loses — for town halls and meetings.',
        switches: PRESETS.DISCUSSION,
      },
      {
        id: 'GAME',
        label: 'Game',
        blurb: 'A scored race with speed, streaks, standings between questions and a podium.',
        switches: PRESETS.GAME,
      },
      {
        id: 'SURVEY',
        label: 'Survey',
        blurb: 'Collect opinions. Never graded, and the room does not see the split.',
        switches: PRESETS.SURVEY,
      },
      {
        id: 'CUSTOM',
        label: 'Custom',
        blurb: 'Mix them. Q&A during a scored quiz, a podium without a timer — whatever the room needs.',
        switches: null,
      },
    ],
  });
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
        preset: true,
        scoringEnabled: true,
        qaEnabled: true,
        sessionMode: true,
        organization: { select: { name: true, logoUrl: true, primaryColor: true } },
      },
    });

    if (!event || event.roomCodeRetiredAt) {
      res.status(404).json({ message: 'That code did not match a room.' });
      return;
    }

    res.json({
      title: event.title,
      // Kept in the response for older clients; always false in practice now.
      allowAnonymous: false,
      passcodeRequired: Boolean(event.passcodeHash),
      // Enough for the join screen to take on the room's colour before anyone
      // is admitted — you can see whether you are walking into a game or a
      // discussion before you type your name.
      preset: event.preset,
      scoringEnabled: event.scoringEnabled,
      qaEnabled: event.qaEnabled,
      sessionMode: event.sessionMode,
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
