import { Router } from 'express';
import { getActivityLogs } from '../controllers/log.controller';
import { authenticateHost } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateHost);

router.get('/', getActivityLogs);

export default router;
