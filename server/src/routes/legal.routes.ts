import { Router } from 'express';
import { getCompanyDetails } from '../controllers/legal.controller';

const router = Router();

// Public and unauthenticated: these pages have to be readable by a payment
// gateway's reviewer and by anyone deciding whether to buy.
router.get('/company', getCompanyDetails);

export default router;
