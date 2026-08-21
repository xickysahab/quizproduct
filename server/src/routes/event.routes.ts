import { Router } from 'express';
import { createEvent, getHostEvents, getEventById, deleteEvent, updateEventConfig, clearEventData, duplicateEvent } from '../controllers/event.controller';
import { authenticateHost } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateHost);

router.post('/', createEvent);
router.get('/', getHostEvents);
router.get('/:id', getEventById);
router.post('/:id/duplicate', duplicateEvent);
router.delete('/:id', deleteEvent);
router.put('/:id/config', updateEventConfig);
router.delete('/:id/clear-data', clearEventData);

export default router;
