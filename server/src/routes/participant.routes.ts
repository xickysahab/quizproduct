import { Router } from 'express';
import { joinEvent, submitResponse, getMyResult } from '../controllers/participant.controller';
import { authenticateParticipant } from '../middleware/participant.middleware';
import { joinLimiter, responseLimiter } from '../config/rateLimit';

const router = Router();

router.post('/join', joinLimiter, joinEvent);
router.post('/response', authenticateParticipant, responseLimiter, submitResponse);
router.get('/me', authenticateParticipant, getMyResult);

export default router;
