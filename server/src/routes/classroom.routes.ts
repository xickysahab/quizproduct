import { Router } from 'express';
import { authenticateHost, authorizeRoles } from '../middleware/auth.middleware';
import {
  createClassroom,
  deleteClassroom,
  getClassroom,
  listClassrooms,
  removeStudent,
  resetClassCode,
  updateClassroom,
} from '../controllers/classroom.controller';

const router = Router();

router.use(authenticateHost);

// Teachers are the people who run sessions; admins above them can see and
// manage classes but do not own them.
router.post('/', authorizeRoles('TENANT', 'STAFF'), createClassroom);
router.get('/', listClassrooms);
router.get('/:id', getClassroom);
router.patch('/:id', updateClassroom);
router.post('/:id/reset-code', resetClassCode);
router.delete('/:id/members/:studentId', removeStudent);
router.delete('/:id', deleteClassroom);

export default router;
