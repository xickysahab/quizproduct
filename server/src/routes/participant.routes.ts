import { Router } from 'express';
import { joinEvent, submitResponse } from '../controllers/participant.controller';

const router = Router();

router.post('/join', joinEvent);
router.post('/response', submitResponse);

export default router;
