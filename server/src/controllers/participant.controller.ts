import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { responseBatcher } from '../utils/responseBatcher';
import { generateParticipantToken } from '../utils/participantToken';
import { ParticipantRequest } from '../middleware/participant.middleware';
import { env } from '../config/env';
import { scoreAnswer } from '../utils/questionTypes';
import { bumpUsage, participantCapForOrg } from '../utils/usage';
import { slog } from '../utils/slog';
import { normalizeRoomCode } from '../utils/roomCode';
import { liveEvents } from '../utils/liveEvents';
import { getParticipantStanding } from '../utils/leaderboard';

const MAX_NAME_LENGTH = 40;
const MAX_ANSWER_TEXT = 280;

export const joinEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomCode, name, sessionKey } = req.body;

    if (typeof roomCode !== 'string') {
      res.status(400).json({ message: 'A room code is required.' });
      return;
    }

    const formattedCode = normalizeRoomCode(roomCode);
    const trimmedName = typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';

    if (!formattedCode) {
      res.status(400).json({ message: 'A room code is required.' });
      return;
    }

    const event = await prisma.event.findUnique({
      where: { roomCode: formattedCode },
      select: {
        id: true,
        title: true,
        isLive: true,
        currentQuestionId: true,
        organizationId: true,
        allowAnonymous: true,
        qaEnabled: true,
        roomCodeRetiredAt: true,
      },
    });

    if (!event) {
      res.status(404).json({ message: 'That code did not match a room. Check the digits and try again.' });
      return;
    }

    // A retired code stops working rather than staying joinable forever.
    if (event.roomCodeRetiredAt) {
      res.status(410).json({ message: 'This session has closed.' });
      return;
    }

    if (!trimmedName && !event.allowAnonymous) {
      res.status(400).json({ message: 'The host asked everyone to join with a name.' });
      return;
    }

    // Reuse this device's existing row rather than creating a second one. A
    // duplicate splits the person's score across two leaderboard entries and
    // burns another seat against the plan's participant cap.
    const key = typeof sessionKey === 'string' && sessionKey.trim() ? sessionKey.trim().slice(0, 64) : null;

    if (key) {
      const existing = await prisma.participant.findUnique({
        where: { eventId_sessionKey: { eventId: event.id, sessionKey: key } },
      });

      if (existing) {
        // Let them correct their name on the way back in.
        const participant = trimmedName && trimmedName !== existing.name
          ? await prisma.participant.update({ where: { id: existing.id }, data: { name: trimmedName } })
          : existing;

        res.status(200).json({
          message: 'Welcome back',
          rejoined: true,
          participant: { id: participant.id, name: participant.name },
          participantToken: generateParticipantToken(participant.id, event.id),
          event: {
            id: event.id,
            title: event.title,
            isLive: event.isLive,
            currentQuestionId: event.currentQuestionId,
            qaEnabled: event.qaEnabled,
          },
        });
        return;
      }
    }

    const participantCount = await prisma.participant.count({ where: { eventId: event.id } });
    const cap = await participantCapForOrg(event.organizationId, env.maxParticipantsPerEvent);

    if (participantCount >= cap) {
      res.status(429).json({ message: 'This room is full. Please contact the host.' });
      return;
    }

    const participant = await prisma.participant.create({
      data: {
        eventId: event.id,
        // Anonymous participants are stored with an empty name; the UI shows a
        // generated label rather than inventing one here.
        name: trimmedName,
        sessionKey: key,
      },
    });

    await bumpUsage(event.organizationId, 'participantsJoined');
    liveEvents.publish('participant:joined', { eventId: event.id });

    res.status(201).json({
      message: 'Joined event successfully',
      rejoined: false,
      participant: { id: participant.id, name: participant.name },
      participantToken: generateParticipantToken(participant.id, event.id),
      event: {
        id: event.id,
        title: event.title,
        isLive: event.isLive,
        currentQuestionId: event.currentQuestionId,
        qaEnabled: event.qaEnabled,
      },
    });
  } catch (error) {
    slog('error', 'participant.join_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const submitResponse = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { participantId, eventId } = req.participant!;
    const { questionId, selectedOption, selectedOptions, answerText } = req.body;

    if (typeof questionId !== 'string') {
      res.status(400).json({ message: 'Question ID is required.' });
      return;
    }

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        event: {
          select: {
            id: true,
            isLive: true,
            currentQuestionId: true,
            currentQuestionStartedAt: true,
          },
        },
      },
    });

    if (!question) {
      res.status(404).json({ message: 'Question not found.' });
      return;
    }

    if (question.event.id !== eventId) {
      res.status(403).json({ message: 'This question does not belong to your room.' });
      return;
    }

    if (!question.event.isLive || question.event.currentQuestionId !== questionId) {
      res.status(400).json({ message: 'This question is no longer active.' });
      return;
    }

    if (question.timeLimit && question.event.currentQuestionStartedAt) {
      const elapsedSeconds =
        (Date.now() - question.event.currentQuestionStartedAt.getTime()) / 1000;

      if (elapsedSeconds > question.timeLimit + env.answerGracePeriodSeconds) {
        res.status(400).json({ message: 'Time is up for this question.' });
        return;
      }
    }

    const type = question.type;
    let optionIndex = 0;
    let optionList: number[] = [];
    let text: string | null = null;

    if (type === 'OPEN_TEXT' || type === 'WORD_CLOUD') {
      if (typeof answerText !== 'string' || !answerText.trim()) {
        res.status(400).json({ message: 'A text answer is required.' });
        return;
      }
      text = answerText.trim().slice(0, MAX_ANSWER_TEXT);
    } else if (type === 'MULTI_SELECT') {
      const raw = Array.isArray(selectedOptions) ? selectedOptions : [];
      optionList = raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < question.options.length);
      if (optionList.length === 0) {
        res.status(400).json({ message: 'Select at least one option.' });
        return;
      }
      optionIndex = optionList[0] ?? 0;
    } else {
      optionIndex = Number(selectedOption);
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.options.length) {
        res.status(400).json({ message: 'Selected option is out of range for this question.' });
        return;
      }
    }

    const { isCorrect, score } = scoreAnswer(question, optionIndex, optionList);

    await responseBatcher.addResponse({
      questionId,
      participantId,
      selectedOption: optionIndex,
      selectedOptions: optionList,
      answerText: text,
      isCorrect,
      score,
    });

    // Tell the socket layer a real, validated answer landed. The host's live
    // counter is derived from this rather than from a client-emitted event.
    liveEvents.publish('response:recorded', { eventId, questionId });

    res.status(200).json({ message: 'Response queued successfully', batched: true });
  } catch (error) {
    slog('error', 'participant.submit_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getMyResult = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { participantId, eventId } = req.participant!;

    // Ranked in Postgres. This used to load every participant in the event
    // with all of their responses and sort them in JavaScript, on a request a
    // participant makes at the end of every session.
    const standing = await getParticipantStanding(eventId, participantId);

    res.json(standing);
  } catch (error) {
    slog('error', 'participant.result_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
