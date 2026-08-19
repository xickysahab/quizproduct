import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.middleware';
import { getQuestionAnalytics, exportEventAnalytics, getEventSummaryAnalytics } from '../controllers/analytics.controller';

const router = Router();

router.get('/questions/:id', authenticateHost, getQuestionAnalytics);
router.get('/events/:id/export', authenticateHost, exportEventAnalytics);
router.get('/events/:id/summary', authenticateHost, getEventSummaryAnalytics);

export default router;
