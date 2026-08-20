import { Router } from 'express';
import { login, getMe, changePassword } from '../controllers/auth.controller';
import { authenticateHost } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/me', authenticateHost, getMe);
router.put('/password', authenticateHost, changePassword);

export default router;
