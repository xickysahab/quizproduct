import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import { createSubAdmin, getSubAdmins } from '../controllers/superadmin.controller';

const router = Router();

router.use(authenticateHost, authorizeRoles('SUPERADMIN'));

router.post('/subadmins', createSubAdmin);
router.get('/subadmins', getSubAdmins);

export default router;
