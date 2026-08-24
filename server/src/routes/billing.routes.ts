import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.middleware';
import {
  createCheckoutSession,
  listPlans,
  listInvoices,
  updateTaxDetails,
  confirmPayment,
  getSubscription,
  listStates,
  getInvoice,
} from '../controllers/billing.controller';

const router = Router();

// Public: the pricing page needs this before anyone signs in.
router.get('/plans', listPlans);
// The billing form needs the state list before the org has a state.
router.get('/states', listStates);

router.post('/checkout', authenticateHost, createCheckoutSession);
router.post('/confirm', authenticateHost, confirmPayment);
router.get('/subscription', authenticateHost, getSubscription);
router.get('/invoices', authenticateHost, listInvoices);
router.get('/invoices/:id', authenticateHost, getInvoice);
router.patch('/tax-details', authenticateHost, updateTaxDetails);

export default router;
