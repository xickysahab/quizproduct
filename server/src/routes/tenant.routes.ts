import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import { createStaff, getStaff, getTenantEvents } from '../controllers/tenant.controller';

const router = Router();

router.use(authenticateHost, authorizeRoles('TENANT'));

router.post('/staff', createStaff);
router.get('/staff', getStaff);
router.get('/events', getTenantEvents);

export default router;
