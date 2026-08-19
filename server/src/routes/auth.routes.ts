import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';
import { authenticateHost } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', authenticateHost, register);
router.post('/login', login);

export default router;
