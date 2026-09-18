import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/logger';
import { canAccessEvent } from '../utils/access';
import { normalizeQuestionInput } from '../utils/questionTypes';
import { assertCanAddQuestion, assertCanDraft, releaseAiDraft } from '../utils/usage';
import { DRAFT_LANGUAGES, DRAFT_TYPES, DraftError, MAX_DRAFTS, MAX_PDF_BYTES, draftQuestions } from '../utils/aiDrafts';
import { QuestionType } from '../utils/questionTypes';
import { MAX_IMPORT_ROWS, parseImport } from '../utils/questionImport';
import { slog } from '../utils/slog';

export const addQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = normalizeQuestionInput(req.body || {});
    if ('error' in parsed) {
      res.status(400).json({ message: parsed.error });
      return;
    }

    const eventId = req.body?.eventId;
    if (typeof eventId !== 'string') {
      res.status(400).json({ message: 'Event ID is required.' });
      return;
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden. You do not have access to this event.' });
      return;
    }

    const count = await prisma.question.count({ where: { eventId } });
    const quota = await assertCanAddQuestion(event.organizationId, count);
    if (!quota.ok) {
      res.status(402).json({ message: quota.message });
      return;
    }

    // Derive the next slot from the highest existing order, not the row count.
    // Deleting the middle question of three drops the count to 2, so `count + 1`
    // handed out an order value that was already in use and left the deck in a
    // non-deterministic sequence.
    const last = await prisma.question.findFirst({
      where: { eventId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const question = await prisma.question.create({
      data: {
        eventId,
        type: parsed.value.type,
        text: parsed.value.text,
        options: parsed.value.options,
        correctOption: parsed.value.correctOption,
        correctOptions: parsed.value.correctOptions,
        order: (last?.order ?? 0) + 1,
        timeLimit: parsed.value.timeLimit,
        scored: parsed.value.scored,
        imageUrl: parsed.value.imageUrl,
      },
    });

    await logActivity(req.user?.userId, 'ADD_QUESTION', 'Question', question.id, {
      eventId,
      text: question.text,
      type: question.type,
    });

    res.status(201).json({ message: 'Question created successfully', question });
  } catch (error) {
    slog('error', 'question.add_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const existingQuestion = await prisma.question.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!existingQuestion || !(await canAccessEvent(req.user!.userId, req.user!.role, existingQuestion.event.hostId))) {
      res.status(403).json({ message: 'Forbidden. Question not found or unauthorized.' });
      return;
    }

    const parsed = normalizeQuestionInput({
      type: req.body?.type ?? existingQuestion.type,
      text: req.body?.text ?? existingQuestion.text,
      options: req.body?.options ?? existingQuestion.options,
      correctOption: req.body?.correctOption === undefined ? existingQuestion.correctOption : req.body.correctOption,
      correctOptions: req.body?.correctOptions ?? existingQuestion.correctOptions,
      timeLimit: req.body?.timeLimit === undefined ? existingQuestion.timeLimit : req.body.timeLimit,
      scored: req.body?.scored === undefined ? existingQuestion.scored : req.body.scored,
      imageUrl: req.body?.imageUrl === undefined ? existingQuestion.imageUrl : req.body.imageUrl,
    });

    if ('error' in parsed) {
      res.status(400).json({ message: parsed.error });
      return;
    }

    const question = await prisma.question.update({
      where: { id },
      data: parsed.value,
    });

    await logActivity(req.user?.userId, 'UPDATE_QUESTION', 'Question', question.id, {
      eventId: existingQuestion.eventId,
      text: question.text,
    });

    res.status(200).json({ message: 'Question updated successfully', question });
  } catch (error) {
    slog('error', 'question.update_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Rewrites the running order of an event's questions from a client-supplied
 * list of IDs. Also the repair path for decks left with duplicate order values
 * by the old `count + 1` numbering.
 */
export const reorderQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id as string;
    const { questionIds } = req.body || {};

    if (!Array.isArray(questionIds) || questionIds.some((id) => typeof id !== 'string')) {
      res.status(400).json({ message: 'questionIds must be an array of question IDs.' });
      return;
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
      res.status(403).json({ message: 'Forbidden. You do not have access to this event.' });
      return;
    }

    const existing = await prisma.question.findMany({ where: { eventId }, select: { id: true } });

    // Reject a partial list outright rather than silently leaving questions
    // stranded at their old positions.
    const existingIds = new Set(existing.map((question) => question.id));
    const submitted = new Set(questionIds);

    if (submitted.size !== questionIds.length) {
      res.status(400).json({ message: 'The order contains a duplicate question.' });
      return;
    }

    if (submitted.size !== existingIds.size || questionIds.some((id) => !existingIds.has(id))) {
      res.status(400).json({ message: 'The order must list every question in this event exactly once.' });
      return;
    }

    await prisma.$transaction(
      questionIds.map((id, index) =>
        prisma.question.update({ where: { id }, data: { order: index + 1 } })
      )
    );

    const questions = await prisma.question.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
    });

    await logActivity(req.user?.userId, 'REORDER_QUESTIONS', 'Event', eventId, {
      count: questionIds.length,
    });

    res.status(200).json({ message: 'Question order updated', questions });
  } catch (error) {
    slog('error', 'question.reorder_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const existingQuestion = await prisma.question.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!existingQuestion || !(await canAccessEvent(req.user!.userId, req.user!.role, existingQuestion.event.hostId))) {
      res.status(403).json({ message: 'Forbidden. Question not found or unauthorized.' });
      return;
    }

    await prisma.question.delete({ where: { id } });

    await logActivity(req.user?.userId, 'DELETE_QUESTION', 'Question', id, {
      eventId: existingQuestion.eventId,
      text: existingQuestion.text,
    });

    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (error) {
    slog('error', 'question.delete_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Drafts questions from a chapter PDF. Nothing is saved: the drafts go back to
 * the host, who edits and accepts them through the ordinary add path.
 */
export const draftFromPdf = async (req: AuthRequest, res: Response): Promise<void> => {
  const { pdfBase64, language, count, types } = req.body || {};

  if (typeof pdfBase64 !== 'string' || !pdfBase64) {
    res.status(400).json({ message: 'Attach a PDF.' });
    return;
  }
  // base64 is 4 bytes per 3; checked before decoding anything.
  if ((pdfBase64.length * 3) / 4 > MAX_PDF_BYTES) {
    res.status(413).json({ message: `The PDF must be under ${MAX_PDF_BYTES / 1024 / 1024} MB.` });
    return;
  }
  if (!Buffer.from(pdfBase64.slice(0, 8), 'base64').toString('latin1').startsWith('%PDF')) {
    res.status(400).json({ message: 'That file is not a PDF.' });
    return;
  }
  if (typeof language !== 'string' || !(language in DRAFT_LANGUAGES)) {
    res.status(400).json({ message: 'Choose one of the supported languages.' });
    return;
  }
  const howMany = Number(count);
  if (!Number.isInteger(howMany) || howMany < 1 || howMany > MAX_DRAFTS) {
    res.status(400).json({ message: `Ask for between 1 and ${MAX_DRAFTS} questions.` });
    return;
  }
  const wanted = (Array.isArray(types) ? types : ['MCQ']).filter((t): t is QuestionType =>
    DRAFT_TYPES.includes(t)
  );
  if (wanted.length === 0) {
    res.status(400).json({ message: 'Choose at least one question type.' });
    return;
  }

  const event = await prisma.event.findUnique({ where: { id: req.params.id as string } });
  if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
    res.status(403).json({ message: 'Forbidden. You do not have access to this event.' });
    return;
  }

  const quota = await assertCanDraft(event.organizationId);
  if (!quota.ok) {
    res.status(402).json({ message: quota.message });
    return;
  }

  try {
    const drafts = await draftQuestions({ pdfBase64, language, count: howMany, types: wanted });
    if (drafts.length === 0) throw new DraftError('No usable questions came back. Try again.', 502);

    await logActivity(req.user?.userId, 'DRAFT_QUESTIONS', 'Event', event.id, {
      language,
      requested: howMany,
      drafted: drafts.length,
    });
    res.status(200).json({ drafts });
  } catch (error) {
    // A failed draft should not cost the workspace one of its allowance.
    await releaseAiDraft(event.organizationId);
    if (error instanceof DraftError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    slog('error', 'question.draft_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Could not draft questions. Try again.' });
  }
};

/**
 * Imports a question bank from a spreadsheet. All or nothing: one bad row and
 * nothing is saved, and every bad row comes back with its row number, so the
 * host fixes the sheet once rather than discovering problems one at a time.
 */
export const importQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ message: 'The sheet has no question rows.' });
    return;
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    res.status(400).json({ message: `Import at most ${MAX_IMPORT_ROWS} questions at a time.` });
    return;
  }

  const eventId = req.params.id as string;
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || !(await canAccessEvent(req.user!.userId, req.user!.role, event.hostId))) {
    res.status(403).json({ message: 'Forbidden. You do not have access to this event.' });
    return;
  }

  const parsed = parseImport(rows);
  if ('errors' in parsed) {
    res.status(400).json({ message: `${parsed.errors.length} rows need fixing. Nothing was imported.`, errors: parsed.errors });
    return;
  }

  const existing = await prisma.question.count({ where: { eventId } });
  // The guard asks whether one more fits; the last of these rows is that one.
  const quota = await assertCanAddQuestion(event.organizationId, existing + parsed.questions.length - 1);
  if (!quota.ok) {
    res.status(402).json({ message: quota.message });
    return;
  }

  const last = await prisma.question.findFirst({
    where: { eventId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const start = (last?.order ?? 0) + 1;

  await prisma.question.createMany({
    data: parsed.questions.map((q, i) => ({ ...q, eventId, order: start + i })),
  });

  await logActivity(req.user?.userId, 'IMPORT_QUESTIONS', 'Event', eventId, { count: parsed.questions.length });
  res.status(201).json({ message: `${parsed.questions.length} questions imported.`, count: parsed.questions.length });
};
