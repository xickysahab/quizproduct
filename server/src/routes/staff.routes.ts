import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import { createEvent, getHostEvents, getEventById, deleteEvent, updateEventConfig, clearEventData } from '../controllers/event.controller';

const router = Router();

router.use(authenticateHost, authorizeRoles('STAFF', 'TENANT')); 

router.post('/events', createEvent);
router.get('/events', getHostEvents);
router.get('/events/:id', getEventById);
router.delete('/events/:id', deleteEvent);
router.put('/events/:id/config', updateEventConfig);
router.delete('/events/:id/clear-data', clearEventData);

export default router;
