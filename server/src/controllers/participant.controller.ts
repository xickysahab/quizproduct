import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { responseBatcher } from '../utils/responseBatcher';
import { generateParticipantToken } from '../utils/participantToken';
import { ParticipantRequest } from '../middleware/participant.middleware';
import { env } from '../config/env';
import { scoreAnswer } from '../utils/questionTypes';
import { bumpUsage, participantCapForOrg } from '../utils/usage';
import { slog } from '../utils/slog';

const MAX_NAME_LENGTH = 40;
const MAX_ANSWER_TEXT = 280;

export const joinEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomCode, name } = req.body;

    if (typeof roomCode !== 'string' || typeof name !== 'string') {
      res.status(400).json({ message: 'Room code and participant name are required.' });
      return;
    }

    const formattedCode = roomCode.trim().toUpperCase();
    const trimmedName = name.trim().slice(0, MAX_NAME_LENGTH);

    if (!formattedCode || !trimmedName) {
      res.status(400).json({ message: 'Room code and participant name are required.' });
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
      },
    });

    if (!event) {
      res.status(404).json({ message: 'Invalid room code. Event not found.' });
      return;
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
        name: trimmedName,
      },
    });

    await bumpUsage(event.organizationId, 'participantsJoined');

    res.status(201).json({
      message: 'Joined event successfully',
      participant: {
        id: participant.id,
        name: participant.name,
      },
      participantToken: generateParticipantToken(participant.id, event.id),
      event: {
        id: event.id,
        title: event.title,
        isLive: event.isLive,
        currentQuestionId: event.currentQuestionId,
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

    res.status(200).json({ message: 'Response queued successfully', batched: true });
  } catch (error) {
    slog('error', 'participant.submit_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getMyResult = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { participantId, eventId } = req.participant!;

    const [mine, others] = await Promise.all([
      prisma.response.findMany({ where: { participantId } }),
      prisma.participant.findMany({
        where: { eventId },
        include: { responses: { select: { score: true, isCorrect: true } } },
      }),
    ]);

    const scoreOf = (responses: { score: number; isCorrect: boolean }[]) =>
      responses.reduce((sum, r) => sum + (r.score || (r.isCorrect ? 1 : 0)), 0);

    const myScore = scoreOf(mine);
    const ranked = others
      .map((p) => ({ id: p.id, score: scoreOf(p.responses) }))
      .sort((a, b) => b.score - a.score);
    const rank = ranked.findIndex((p) => p.id === participantId) + 1;

    res.json({
      score: myScore,
      rank: rank || others.length,
      totalParticipants: others.length,
    });
  } catch (error) {
    slog('error', 'participant.result_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
