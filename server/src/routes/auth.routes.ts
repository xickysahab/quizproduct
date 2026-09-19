import { Router } from 'express';
import { login, getMe, changePassword, forgotPassword, resetPassword, signup, studentSignup, verifyEmail } from '../controllers/auth.controller';
import { acceptInvite } from '../controllers/invite.controller';
import { authenticateUser } from '../middleware/auth.middleware';
import { loginLimiter, signupLimiter, passwordResetLimiter } from '../config/rateLimit';

const router = Router();

router.post('/login', loginLimiter, login);
router.post('/signup', signupLimiter, signup);
router.post('/student-signup', signupLimiter, studentSignup);
router.post('/verify-email', loginLimiter, verifyEmail);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', loginLimiter, resetPassword);
router.post('/accept-invite', loginLimiter, acceptInvite);
router.get('/me', authenticateUser, getMe);
router.put('/password', authenticateUser, changePassword);

export default router;
