import { Router } from 'express';
import { joinEvent, submitResponse, getMyResult, getSessionResults } from '../controllers/participant.controller';
import { authenticateParticipant } from '../middleware/participant.middleware';
import { joinLimiter, responseLimiter } from '../config/rateLimit';
import { getHomework } from '../controllers/homework.controller';

const router = Router();

router.post('/join', joinLimiter, joinEvent);
router.post('/response', authenticateParticipant, responseLimiter, submitResponse);
router.get('/me', authenticateParticipant, getMyResult);
router.get('/results', authenticateParticipant, getSessionResults);
router.get('/homework', authenticateParticipant, getHomework);

export default router;
