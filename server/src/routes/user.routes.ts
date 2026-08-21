import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.middleware';
import { updateManagedUser, deleteManagedUser } from '../controllers/user.controller';

const router = Router();

// Permissions are hierarchy-based rather than role-based here: the controller
// checks that the target sits inside the caller's subtree.
router.use(authenticateHost);

router.patch('/:id', updateManagedUser);
router.delete('/:id', deleteManagedUser);

export default router;
