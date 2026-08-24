import { Router } from 'express';
import { createEvent, getHostEvents, getEventById, deleteEvent, updateEventConfig, clearEventData, duplicateEvent, updateEventAccess, getPublicEventInfo, listStarterTemplates, createEventFromTemplate , listPresets } from '../controllers/event.controller';
import { authenticateHost } from '../middleware/auth.middleware';
import { joinLimiter } from '../config/rateLimit';

const router = Router();

// Public: the join screen needs to know whether a passcode is required, and
// which branding to show, before anyone is admitted.
// Rate-limited like /participants/join: this endpoint confirms whether a code
// exists, so without a limit it is a code-enumeration oracle.
router.get('/public/:code', joinLimiter, getPublicEventInfo);

router.use(authenticateHost);

router.post('/', createEvent);
router.get('/', getHostEvents);
router.get('/templates/starters', listStarterTemplates);
router.post('/templates/starters', createEventFromTemplate);
// Registered before /:id so "presets" is never read as an event ID.
router.get('/presets', listPresets);
router.get('/:id', getEventById);
router.post('/:id/duplicate', duplicateEvent);
router.delete('/:id', deleteEvent);
router.put('/:id/config', updateEventConfig);
router.patch('/:id/access', updateEventAccess);
router.delete('/:id/clear-data', clearEventData);

export default router;
