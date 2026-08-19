import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import { createTenant, getTenants } from '../controllers/subadmin.controller';

const router = Router();

router.use(authenticateHost, authorizeRoles('SUBADMIN'));

router.post('/tenants', createTenant);
router.get('/tenants', getTenants);

export default router;
