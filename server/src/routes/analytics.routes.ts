import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.middleware';
import {
  getQuestionAnalytics,
  exportEventAnalytics,
  getEventSummaryAnalytics,
  getEventLeaderboard,
  getEventParticipants,
} from '../controllers/analytics.controller';

const router = Router();

router.get('/questions/:id', authenticateHost, getQuestionAnalytics);
router.get('/events/:id/export', authenticateHost, exportEventAnalytics);
router.get('/events/:id/summary', authenticateHost, getEventSummaryAnalytics);
router.get('/events/:id/leaderboard', authenticateHost, getEventLeaderboard);
router.get('/events/:id/participants', authenticateHost, getEventParticipants);

export default router;
