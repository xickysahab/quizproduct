import { Router } from 'express';
import { login, getMe, changePassword, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { acceptInvite } from '../controllers/invite.controller';
import { authenticateHost } from '../middleware/auth.middleware';
import { loginLimiter } from '../config/rateLimit';

const router = Router();

router.post('/login', loginLimiter, login);
router.post('/forgot-password', loginLimiter, forgotPassword);
router.post('/reset-password', loginLimiter, resetPassword);
router.post('/accept-invite', loginLimiter, acceptInvite);
router.get('/me', authenticateHost, getMe);
router.put('/password', authenticateHost, changePassword);

export default router;
