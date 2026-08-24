import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import { createSubAdmin, getSubAdmins, getAllTenants, getPlatformStats } from '../controllers/superadmin.controller';
import {
  listPlansForAdmin,
  createPlan,
  updatePlan,
  setPlanAvailability,
  setDefaultPlan,
} from '../controllers/pricingPlan.controller';

const router = Router();

router.use(authenticateHost, authorizeRoles('SUPERADMIN'));

router.get('/stats', getPlatformStats);
router.post('/subadmins', createSubAdmin);
router.get('/subadmins', getSubAdmins);
router.get('/tenants', getAllTenants);

// Pricing. Every route here is behind the SUPERADMIN guard applied above —
// changing what the product costs is not something a tenant admin can reach.
router.get('/plans', listPlansForAdmin);
router.post('/plans', createPlan);
router.patch('/plans/:id', updatePlan);
router.patch('/plans/:id/availability', setPlanAvailability);
router.patch('/plans/:id/default', setDefaultPlan);

export default router;
