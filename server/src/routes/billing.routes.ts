import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.middleware';
import {
  createCheckoutSession,
  listPlans,
  listInvoices,
  updateTaxDetails,
  confirmPayment,
} from '../controllers/billing.controller';

const router = Router();

// Public: the pricing page needs this before anyone signs in.
router.get('/plans', listPlans);

router.post('/checkout', authenticateHost, createCheckoutSession);
router.post('/confirm', authenticateHost, confirmPayment);
router.get('/invoices', authenticateHost, listInvoices);
router.patch('/tax-details', authenticateHost, updateTaxDetails);

export default router;
