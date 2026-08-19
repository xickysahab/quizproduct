import { Router } from 'express';
import { addQuestion, updateQuestion, deleteQuestion } from '../controllers/question.controller';
import { authenticateHost } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateHost);

router.post('/', addQuestion);
router.put('/:id', updateQuestion);
router.delete('/:id', deleteQuestion);

export default router;
