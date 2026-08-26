import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { Parser } from '@json2csv/plainjs';
import { canAccessEvent } from '../utils/access';
import { collectiveTally, tallyQuestion } from '../utils/tally';
import { getLeaderboard, countParticipants } from '../utils/leaderboard';
import { parsePagination } from '../utils/validation';

export const getQuestionAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const questionId = req.params.id as string;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { event: true, responses: true },
    });

    if (!question || !(await canAccessEvent(req.user!.userId, req.user!.role, question.event.hostId))) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    const tally = tallyQuestion(question, question.responses);

    res.status(200).json({
      totalResponses: tally.totalResponses,
      optionCounts: tally.optionCounts,
      percentages: tally.percentages,
      textAnswers: tally.textAnswers,
      words: tally.words,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const exportEventAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    const total = await prisma.participant.count({ where: { eventId } });

    if (total === 0) {
      res.status(400).json({ message: 'No participants data to export' });
      return;
    }

    const fields = [
      'ParticipantName',
      'JoinedAt',
      'TotalScore',
      ...event.questions.flatMap((q, index) => [`Q${index + 1} (${q.text})`, `Q${index + 1} Score`]),
    ];

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`${event.title.replace(/\s+/g, '_')}_Analytics.csv`);

    // UTF-8 byte-order mark. Excel on Windows assumes the system codepage
    // without it, which turns every Devanagari, Tamil or Bengali participant
    // name into mojibake — the single most visible export bug for an Indian
    // product. LibreOffice and Sheets are unaffected either way.
    res.write('\uFEFF');

    // Streamed in pages rather than materialising every participant and every
    // response in memory first. A 5,000-person event used to build the entire
    // object graph, then the entire CSV string, before sending a byte.
    const PAGE = 200;

    for (let offset = 0; offset < total; offset += PAGE) {
      const participants = await prisma.participant.findMany({
        where: { eventId },
        include: { responses: true },
        orderBy: { joinedAt: 'asc' },
        skip: offset,
        take: PAGE,
      });

      const rows = participants.map((p) => {
        const row: Record<string, string | number> = {
          ParticipantName: p.name || 'Anonymous',
          JoinedAt: p.joinedAt.toISOString(),
          TotalScore: p.responses.reduce((sum, r) => sum + (r.score || (r.isCorrect ? 1 : 0)), 0),
        };

        event.questions.forEach((q, index) => {
          const response = p.responses.find((r) => r.questionId === q.id);
          row[`Q${index + 1} (${q.text})`] = response
            ? response.answerText ||
              (response.selectedOptions?.length
                ? response.selectedOptions.map((i) => q.options[i] ?? i).join('; ')
                : q.options[response.selectedOption] ?? response.selectedOption)
            : 'No Answer';
          row[`Q${index + 1} Score`] = response?.score ?? 0;
        });

        return row;
      });

      // Header only on the first chunk.
      const parser = new Parser({ fields, header: offset === 0 });
      res.write(parser.parse(rows));
      res.write('\n');
    }

    res.end();
  } catch (error) {
    console.error('Export error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
    else res.end();
  }
};

export const getEventSummaryAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { questions: { orderBy: { order: 'asc' }, include: { responses: true } } },
    });

    if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    const summary = event.questions.map((question) => ({
      ...tallyQuestion(question, question.responses),
      correctOption: question.correctOption,
      correctOptions: question.correctOptions,
    }));

    // Null unless every scored question shares one scale — see collectiveTally.
    // The old version assumed four options and averaged percentages across
    // questions, then padded the largest to force a sum of 100.
    const collective = collectiveTally(summary);

    res.status(200).json({
      eventId: event.id,
      title: event.title,
      totalParticipants: await prisma.participant.count({ where: { eventId } }),
      questions: summary,
      collective: collective
        ? {
            totalResponses: collective.totalResponses,
            optionCounts: collective.optionCounts,
            percentages: collective.percentages,
            optionsText: collective.options,
          }
        : null,
    });
  } catch (error) {
    console.error('Summary analytics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getEventLeaderboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hostId: true, title: true },
    });

    if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    // Aggregated in Postgres and paginated. This used to load every
    // participant with every response and reduce them in JavaScript.
    const { skip, take, page, limit } = parsePagination(req.query, {
      defaultLimit: 50,
      maxLimit: 200,
    });

    const [leaderboard, total] = await Promise.all([
      getLeaderboard(eventId, take, skip),
      countParticipants(eventId),
    ]);

    res.status(200).json({
      eventId,
      title: event.title,
      leaderboard,
      pagination: { page, limit, total, hasMore: skip + leaderboard.length < total },
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getEventParticipants = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        questions: { orderBy: { order: 'asc' }, select: { id: true, text: true, options: true, type: true } },
      },
    });

    if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden or not found' });
      return;
    }

    // Paginated: a 5,000-participant Enterprise event would otherwise pull the
    // entire object graph into memory in one go.
    const { skip, take, page, limit } = parsePagination(req.query, {
      defaultLimit: 100,
      maxLimit: 500,
    });

    const [participants, total] = await Promise.all([
      prisma.participant.findMany({
        where: { eventId },
        include: { responses: true },
        orderBy: { joinedAt: 'asc' },
        skip,
        take,
      }),
      prisma.participant.count({ where: { eventId } }),
    ]);

    res.status(200).json({
      eventId,
      pagination: { page, limit, total, hasMore: skip + participants.length < total },
      participants: participants.map((p) => ({
        id: p.id,
        name: p.name,
        joinedAt: p.joinedAt,
        score: p.responses.reduce((sum, r) => sum + (r.score || (r.isCorrect ? 1 : 0)), 0),
        answers: event.questions.map((q) => {
          const response = p.responses.find((r) => r.questionId === q.id);
          return {
            questionId: q.id,
            text: q.text,
            type: q.type,
            answer: response
              ? response.answerText ||
                (response.selectedOptions.length
                  ? response.selectedOptions.map((i) => q.options[i] ?? i).join(', ')
                  : q.options[response.selectedOption] ?? null)
              : null,
            isCorrect: response?.isCorrect ?? false,
            score: response?.score ?? 0,
          };
        }),
      })),
    });
  } catch (error) {
    console.error('Participant breakdown error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
