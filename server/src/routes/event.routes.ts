import { Router } from 'express';
import { createEvent, getHostEvents, getEventById, deleteEvent, updateEventConfig, clearEventData } from '../controllers/event.controller';
import { authenticateHost } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateHost); // All event routes require host authentication

router.post('/', createEvent);
router.get('/', getHostEvents);
router.get('/:id', getEventById);
router.delete('/:id', deleteEvent);
router.put('/:id/config', updateEventConfig);
router.delete('/:id/clear-data', clearEventData);

export default router;
