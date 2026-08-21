import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.middleware';
import { createCheckoutSession } from '../controllers/billing.controller';

const router = Router();

router.post('/checkout', authenticateHost, createCheckoutSession);

export default router;
