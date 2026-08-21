import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.middleware';
import { createInvite } from '../controllers/invite.controller';

const router = Router();

router.post('/', authenticateHost, createInvite);

export default router;
