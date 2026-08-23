import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.middleware';
import { authenticateParticipant } from '../middleware/participant.middleware';
import { qaSubmitLimiter } from '../config/rateLimit';
import {
  listForParticipant,
  submitQuestion,
  toggleUpvote,
  listForHost,
  moderateQuestion,
  updateQaSettings,
} from '../controllers/audienceQuestion.controller';

const router = Router();

// Participant side — authenticated by the room token, not a login.
router.get('/mine', authenticateParticipant, listForParticipant);
router.post('/', authenticateParticipant, qaSubmitLimiter, submitQuestion);
router.post('/:id/upvote', authenticateParticipant, toggleUpvote);

// Host side.
router.get('/event/:id', authenticateHost, listForHost);
router.patch('/event/:id/settings', authenticateHost, updateQaSettings);
router.patch('/:id', authenticateHost, moderateQuestion);

export default router;
