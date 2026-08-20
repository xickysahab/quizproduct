import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import { createStaff, getStaff, getTenantStats } from '../controllers/tenant.controller';

const router = Router();

router.use(authenticateHost, authorizeRoles('TENANT'));

router.get('/stats', getTenantStats);
router.post('/staff', createStaff);
router.get('/staff', getStaff);

export default router;
