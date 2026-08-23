import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.middleware';
import {
  listPurposes,
  recordConsent,
  getMyConsents,
  requestDeletion,
  anonymiseEventParticipants,
} from '../controllers/privacy.controller';

const router = Router();

// Public: the signup form needs the purpose list before an account exists.
router.get('/purposes', listPurposes);

router.get('/consents', authenticateHost, getMyConsents);
router.post('/consents', authenticateHost, recordConsent);
router.post('/delete-account', authenticateHost, requestDeletion);
router.post('/events/:id/anonymise', authenticateHost, anonymiseEventParticipants);

export default router;
