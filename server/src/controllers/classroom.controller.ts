import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';
import { canAccessEvent, getAccessibleHostIds } from '../utils/access';
import { generateClassCode, normalizeClassCode } from '../utils/classCode';
import { organizationIdForUser } from '../utils/org';
import { logActivity } from '../utils/logger';
import { slog } from '../utils/slog';

/**
 * Classes, Google Classroom style: a teacher makes one, shares its code or
 * link, and students who join stay in it until the teacher removes them.
 *
 * Who may see a class follows who may see a teacher's events — the teacher,
 * the tenant above them, and so on up — so an org admin sees every class in
 * the organisation without a second permission model.
 */

const MAX_TEXT = 80;

const cleanText = (value: unknown, required: boolean): string | null | undefined => {
  if (value === undefined) return required ? null : undefined;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return required ? null : '';
  return text.length > MAX_TEXT ? null : text;
};

const fail = (res: Response, where: string, error: unknown): void => {
  slog('error', `classroom.${where}_failed`, { error: error instanceof Error ? error.message : String(error) });
  res.status(500).json({ message: 'Internal server error' });
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Retries on the rare code collision instead of surfacing a 500. */
const withFreshCode = async <T>(write: (joinCode: string) => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await write(generateClassCode());
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 4) throw error;
    }
  }
};

/** The class if this staff user may manage it, else null (reported as 404). */
const findManageable = async (req: AuthRequest, id: string) => {
  const classroom = await prisma.classroom.findUnique({ where: { id } });
  if (!classroom) return null;
  const allowed = await canAccessEvent(req.user!.userId, req.user!.role, classroom.teacherId);
  return allowed ? classroom : null;
};

const activeMembers = { where: { removedAt: null } } as const;

// ---- Teacher side --------------------------------------------------------

export const createClassroom = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const name = cleanText(req.body?.name, true);
    const section = cleanText(req.body?.section, false);
    if (!name || section === null) {
      res.status(400).json({ message: `Class name is required, up to ${MAX_TEXT} characters.` });
      return;
    }

    const teacherId = req.user!.userId;
    const organizationId = await organizationIdForUser(teacherId);

    const classroom = await withFreshCode((joinCode) =>
      prisma.classroom.create({
        data: { name, section: section || null, joinCode, teacherId, organizationId },
      })
    );

    await logActivity(teacherId, 'CREATE_CLASSROOM', 'Classroom', classroom.id, { name });
    res.status(201).json({ classroom: { ...classroom, studentCount: 0 } });
  } catch (error) {
    fail(res, 'create', error);
  }
};

export const listClassrooms = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const teacherIds = await getAccessibleHostIds(req.user!.userId, req.user!.role);
    const rows = await prisma.classroom.findMany({
      where: teacherIds === null ? undefined : { teacherId: { in: teacherIds } },
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { members: activeMembers } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      classrooms: rows.map(({ _count, ...classroom }) => ({ ...classroom, studentCount: _count.members })),
    });
  } catch (error) {
    fail(res, 'list', error);
  }
};

export const getClassroom = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await findManageable(req, req.params.id as string);
    if (!classroom) {
      res.status(404).json({ message: 'Class not found.' });
      return;
    }

    const [teacher, members] = await Promise.all([
      prisma.user.findUnique({ where: { id: classroom.teacherId }, select: { id: true, name: true } }),
      prisma.classroomMember.findMany({
        where: { classroomId: classroom.id, removedAt: null },
        select: { joinedAt: true, student: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
    ]);

    res.json({
      classroom: { ...classroom, teacher, studentCount: members.length },
      students: members.map((m) => ({ ...m.student, joinedAt: m.joinedAt })),
    });
  } catch (error) {
    fail(res, 'get', error);
  }
};

export const updateClassroom = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await findManageable(req, req.params.id as string);
    if (!classroom) {
      res.status(404).json({ message: 'Class not found.' });
      return;
    }

    const name = req.body?.name === undefined ? undefined : cleanText(req.body.name, true);
    const section = cleanText(req.body?.section, false);
    if (name === null || section === null) {
      res.status(400).json({ message: `Class name is required, up to ${MAX_TEXT} characters.` });
      return;
    }

    const updated = await prisma.classroom.update({
      where: { id: classroom.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(section !== undefined ? { section: section || null } : {}),
      },
    });
    res.json({ classroom: updated });
  } catch (error) {
    fail(res, 'update', error);
  }
};

/** New code; the old one stops working. Students already in stay in. */
export const resetClassCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await findManageable(req, req.params.id as string);
    if (!classroom) {
      res.status(404).json({ message: 'Class not found.' });
      return;
    }

    const updated = await withFreshCode((joinCode) =>
      prisma.classroom.update({ where: { id: classroom.id }, data: { joinCode } })
    );

    await logActivity(req.user!.userId, 'RESET_CLASS_CODE', 'Classroom', classroom.id, {});
    res.json({ joinCode: updated.joinCode });
  } catch (error) {
    fail(res, 'reset_code', error);
  }
};

export const removeStudent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await findManageable(req, req.params.id as string);
    if (!classroom) {
      res.status(404).json({ message: 'Class not found.' });
      return;
    }

    const { count } = await prisma.classroomMember.updateMany({
      where: { classroomId: classroom.id, studentId: req.params.studentId as string, removedAt: null },
      data: { removedAt: new Date() },
    });

    if (count === 0) {
      res.status(404).json({ message: 'That student is not in this class.' });
      return;
    }

    await logActivity(req.user!.userId, 'REMOVE_STUDENT', 'Classroom', classroom.id, {
      studentId: req.params.studentId,
    });
    res.json({ message: 'Student removed.' });
  } catch (error) {
    fail(res, 'remove_student', error);
  }
};

export const deleteClassroom = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classroom = await findManageable(req, req.params.id as string);
    if (!classroom) {
      res.status(404).json({ message: 'Class not found.' });
      return;
    }

    await prisma.classroom.delete({ where: { id: classroom.id } });
    await logActivity(req.user!.userId, 'DELETE_CLASSROOM', 'Classroom', classroom.id, { name: classroom.name });
    res.json({ message: 'Class deleted.' });
  } catch (error) {
    fail(res, 'delete', error);
  }
};

// ---- Student side --------------------------------------------------------

const studentView = (classroom: {
  id: string;
  name: string;
  section: string | null;
  teacher: { name: string };
}) => ({ id: classroom.id, name: classroom.name, section: classroom.section, teacherName: classroom.teacher.name });

/**
 * Join by code. Idempotent: joining a class you are already in is a success,
 * and a student the teacher removed can rejoin with the current code — the
 * same as Google Classroom. A teacher who wants someone out for good resets
 * the code.
 */
export const joinClassroom = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = normalizeClassCode(req.body?.code);
    const classroom = code
      ? await prisma.classroom.findUnique({
          where: { joinCode: code },
          include: { teacher: { select: { name: true } } },
        })
      : null;

    if (!classroom) {
      res.status(404).json({ message: 'No class uses that code. Check it with your teacher.' });
      return;
    }

    const studentId = req.user!.userId;
    const existing = await prisma.classroomMember.findUnique({
      where: { classroomId_studentId: { classroomId: classroom.id, studentId } },
    });

    if (!existing) {
      // A double tap sends two joins; the loser of that race is still a member.
      await prisma.classroomMember
        .create({ data: { classroomId: classroom.id, studentId } })
        .catch((error) => {
          if (!isUniqueViolation(error)) throw error;
        });
    } else if (existing.removedAt) {
      await prisma.classroomMember.update({
        where: { id: existing.id },
        data: { removedAt: null, joinedAt: new Date() },
      });
    }

    if (!existing || existing.removedAt) {
      await logActivity(studentId, 'JOIN_CLASSROOM', 'Classroom', classroom.id, {});
    }

    res.status(existing && !existing.removedAt ? 200 : 201).json({
      classroom: studentView(classroom),
      alreadyMember: Boolean(existing && !existing.removedAt),
    });
  } catch (error) {
    fail(res, 'join', error);
  }
};

export const listMyClassrooms = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const memberships = await prisma.classroomMember.findMany({
      where: { studentId: req.user!.userId, removedAt: null },
      include: { classroom: { include: { teacher: { select: { name: true } } } } },
      orderBy: { joinedAt: 'desc' },
    });

    res.json({
      classrooms: memberships.map((m) => ({ ...studentView(m.classroom), joinedAt: m.joinedAt })),
    });
  } catch (error) {
    fail(res, 'list_mine', error);
  }
};
