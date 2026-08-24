import { Router } from 'express';
import { addQuestion, updateQuestion, deleteQuestion, reorderQuestions } from '../controllers/question.controller';
import { authenticateHost } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateHost);

router.post('/', addQuestion);
// Registered before /:id so "reorder" is never read as a question ID.
router.put('/event/:id/reorder', reorderQuestions);
router.put('/:id', updateQuestion);
router.delete('/:id', deleteQuestion);

export default router;
