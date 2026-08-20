import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import { getStaffStats } from '../controllers/staff.controller';

const router = Router();

router.use(authenticateHost, authorizeRoles('STAFF'));

router.get('/stats', getStaffStats);

export default router;
