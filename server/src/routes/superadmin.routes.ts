import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import { createSubAdmin, getSubAdmins, getAllTenants, getPlatformStats } from '../controllers/superadmin.controller';

const router = Router();

router.use(authenticateHost, authorizeRoles('SUPERADMIN'));

router.get('/stats', getPlatformStats);
router.post('/subadmins', createSubAdmin);
router.get('/subadmins', getSubAdmins);
router.get('/tenants', getAllTenants);

export default router;
