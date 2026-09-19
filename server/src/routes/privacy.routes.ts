import { Router } from 'express';
import { authenticateHost, authenticateUser } from '../middleware/auth.middleware';
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

// Students hold personal data too, so they can see consents and erase themselves.
router.get('/consents', authenticateUser, getMyConsents);
router.post('/consents', authenticateUser, recordConsent);
router.post('/delete-account', authenticateUser, requestDeletion);
router.post('/events/:id/anonymise', authenticateHost, anonymiseEventParticipants);

export default router;
