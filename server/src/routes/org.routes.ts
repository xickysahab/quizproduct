import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import {
  getMyOrganization,
  updateMyOrganization,
  setOrganizationPlan,
  listOrganizations,
} from '../controllers/org.controller';

const router = Router();

router.use(authenticateHost);
router.get('/me', getMyOrganization);
router.patch('/me', updateMyOrganization);
router.get('/', authorizeRoles('SUPERADMIN'), listOrganizations);
router.patch('/:id/plan', authorizeRoles('SUPERADMIN'), setOrganizationPlan);

export default router;
