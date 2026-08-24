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
import { hashSecret } from '../utils/mailer';
import { safeEquals } from '../utils/webhookSignature';
import { liveEvents } from '../utils/liveEvents';
import { getLeaderboard, getParticipantStanding } from '../utils/leaderboard';
import { isQuestionScored } from '../utils/sessionSettings';
import { tallyQuestion } from '../utils/tally';

const MAX_NAME_LENGTH = 40;
const MAX_ANSWER_TEXT = 280;
/** Points added per consecutive correct answer beyond the first. */
const STREAK_STEP = 100;

/**
 * How many correct answers this participant has running into the given
 * question, counting backwards through the session's question order.
 *
 * Computed from stored responses rather than a counter on Participant, because
 * an answer can be changed until the host advances — a running counter would
 * drift the moment somebody corrected themselves.
 */
const previousStreak = async (
  participantId: string,
  eventId: string,
  currentOrder: number
): Promise<number> => {
  const previous = await prisma.response.findMany({
    where: {
      participantId,
      question: { eventId, order: { lt: currentOrder } },
    },
    select: { isCorrect: true, question: { select: { order: true } } },
    orderBy: { question: { order: 'desc' } },
    take: 20,
  });

  let run = 0;
  for (const response of previous) {
    if (!response.isCorrect) break;
    run += 1;
  }
  return run;
};

export const joinEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomCode, name, sessionKey, passcode } = req.body;

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
        phoneShowsQuestion: true,
        scoringEnabled: true,
        sessionMode: true,
        roomCodeRetiredAt: true,
        passcodeHash: true,
        organization: { select: { name: true, logoUrl: true, primaryColor: true } },
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

    // A passcode is a door code shared with a room, not a password. Compared in
    // constant time anyway, since there is no reason not to.
    if (event.passcodeHash) {
      const supplied = typeof passcode === 'string' ? passcode.trim() : '';
      if (!supplied || !safeEquals(hashSecret(supplied.toLowerCase()), event.passcodeHash)) {
        res.status(401).json({ message: 'That passcode is not right.', passcodeRequired: true });
        return;
      }
    }

    // Every participant gives a name. There is no anonymous path — a name is
    // what makes a leaderboard, a Q&A attribution and a host's report mean
    // anything, and it is required regardless of any legacy column value.
    if (!trimmedName) {
      res.status(400).json({ message: 'Please enter your name to join.' });
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
            // When false the phone shows only the answer tiles, so attention goes
            // to the shared screen rather than down at six phones.
            phoneShowsQuestion: event.phoneShowsQuestion,
            scoringEnabled: event.scoringEnabled,
            sessionMode: event.sessionMode,
          },
          branding: event.organization
            ? {
                name: event.organization.name,
                logoUrl: event.organization.logoUrl,
                primaryColor: event.organization.primaryColor,
              }
            : null,
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
        // When false the phone shows only the answer tiles, so attention goes
        // to the shared screen rather than down at six phones.
        phoneShowsQuestion: event.phoneShowsQuestion,
        scoringEnabled: event.scoringEnabled,
        sessionMode: event.sessionMode,
      },
      branding: event.organization
        ? {
            name: event.organization.name,
            logoUrl: event.organization.logoUrl,
            primaryColor: event.organization.primaryColor,
          }
        : null,
    });
  } catch (error) {
    slog('error', 'participant.join_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const submitResponse = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { participantId, eventId } = req.participant!;
    const { questionId, selectedOption, selectedOptions, answerText, rankedOptions } = req.body;

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
            speedBonusEnabled: true,
            sessionMode: true,
            scoringEnabled: true,
            streakBonusEnabled: true,
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

    let elapsedSeconds = 0;
    if (question.event.currentQuestionStartedAt) {
      elapsedSeconds =
        (Date.now() - question.event.currentQuestionStartedAt.getTime()) / 1000;
    }

    if (question.timeLimit && question.event.currentQuestionStartedAt) {
      if (elapsedSeconds > question.timeLimit + env.answerGracePeriodSeconds) {
        res.status(400).json({ message: 'Time is up for this question.' });
        return;
      }
    }

    const type = question.type;
    let optionIndex = 0;
    let optionList: number[] = [];
    let text: string | null = null;
    let ranked: number[] = [];

    if (type === 'OPEN_TEXT' || type === 'WORD_CLOUD') {
      if (typeof answerText !== 'string' || !answerText.trim()) {
        res.status(400).json({ message: 'A text answer is required.' });
        return;
      }
      text = answerText.trim().slice(0, MAX_ANSWER_TEXT);
    } else if (type === 'RANKING') {
      const raw = Array.isArray(rankedOptions) ? rankedOptions.map(Number) : [];
      // Every option exactly once, in some order — a partial or duplicated
      // ranking is not a ranking.
      const valid =
        raw.length === question.options.length &&
        raw.every((n) => Number.isInteger(n) && n >= 0 && n < question.options.length) &&
        new Set(raw).size === raw.length;

      if (!valid) {
        res.status(400).json({ message: 'Place every option exactly once.' });
        return;
      }
      ranked = raw;
      optionList = raw;
      optionIndex = raw[0] ?? 0;
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

    let { isCorrect, score } = scoreAnswer(question, optionIndex, optionList);

    // Whether THIS question is graded — the session switch, unless the question
    // overrides it. This is what lets one session hold unscored opinion polls
    // and scored quiz questions side by side.
    const questionIsScored = isQuestionScored(
      question.event.scoringEnabled,
      question.scored
    );

    let streak = 0;

    if (!questionIsScored) {
      // Never grade — even if a leftover answer key exists on the question.
      isCorrect = false;
      score = 0;
    } else {
      if (isCorrect) {
        streak = (await previousStreak(participantId, question.eventId, question.order)) + 1;
      }

      if (isCorrect && question.event.speedBonusEnabled && question.timeLimit && question.timeLimit > 0) {
        // Correct answers earn more when submitted earlier. Base stays 1 when
        // the toggle is off so existing leaderboards keep the same scale.
        const remainingRatio = Math.max(0, Math.min(1, 1 - elapsedSeconds / question.timeLimit));
        score = Math.max(1, Math.round(500 + remainingRatio * 500));
      }

      if (isCorrect && question.event.streakBonusEnabled && streak > 1) {
        // Capped so a long run cannot dwarf everything else, matching the shape
        // of the bonus rather than letting it run away.
        score += Math.min(streak - 1, 5) * STREAK_STEP;
      }
    }

    // Instant feedback only for graded questions that actually have a key.
    const scored =
      questionIsScored &&
      (((type === 'MCQ' || type === 'RATING') && question.correctOption !== null) ||
        ((type === 'MULTI_SELECT' || type === 'RANKING') &&
          Array.isArray(question.correctOptions) &&
          question.correctOptions.length > 0));

    await responseBatcher.addResponse({
      questionId,
      participantId,
      selectedOption: optionIndex,
      selectedOptions: optionList,
      rankedOptions: ranked,
      answerText: text,
      isCorrect,
      score,
      streak,
    });

    // Tell the socket layer a real, validated answer landed. The host's live
    // counter is derived from this rather than from a client-emitted event.
    liveEvents.publish('response:recorded', { eventId, questionId });

    let standing: { score: number; rank: number; totalParticipants: number } | null = null;
    if (questionIsScored) {
      // Quiz answers need a live rank. Flush this one write so /standing is
      // not a second behind the tap they just made.
      await responseBatcher.flushNow();
      standing = await getParticipantStanding(eventId, participantId);
    }

    res.status(200).json({
      message: 'Response queued successfully',
      batched: true,
      scored,
      isCorrect: scored ? isCorrect : null,
      score: scored ? score : 0,
      streak: scored && isCorrect ? streak : 0,
      standing,
    });
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

/**
 * Full-session distribution for the end screen. Available once the host has
 * ended the live room. Answer keys are never included — surveys especially
 * must not look like a graded quiz.
 */
export const getSessionResults = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.participant!;

    await responseBatcher.flushNow();

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        isLive: true,
        sessionMode: true,
        questions: {
          orderBy: { order: 'asc' },
          include: { responses: true },
        },
      },
    });

    if (!event) {
      res.status(404).json({ message: 'Session not found.' });
      return;
    }

    // Still live = host has not concluded — keep distributions private until then
    // (mid-session reveal still goes through the socket path).
    if (event.isLive) {
      res.status(403).json({ message: 'Results are available after the host ends the session.' });
      return;
    }

    const totalParticipants = await prisma.participant.count({ where: { eventId } });
    const questions = event.questions.map((question) => tallyQuestion(question, question.responses));
    const leaderboard =
      event.sessionMode === 'SURVEY' ? [] : await getLeaderboard(eventId, 8, 0);

    res.json({
      eventId: event.id,
      title: event.title,
      sessionMode: event.sessionMode,
      totalParticipants,
      questions,
      leaderboard,
    });
  } catch (error) {
    slog('error', 'participant.session_results_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ message: 'Internal server error' });
  }
};
