import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../middleware/auth.middleware';
import { joinClassroom, listMyClassrooms } from '../controllers/classroom.controller';
import { joinLimiter } from '../config/rateLimit';

const router = Router();

router.use(authenticateUser, authorizeRoles('STUDENT'));

// Rate limited: a six-character code is only as private as it is slow to guess.
router.post('/classrooms/join', joinLimiter, joinClassroom);
router.get('/classrooms', listMyClassrooms);

export default router;
