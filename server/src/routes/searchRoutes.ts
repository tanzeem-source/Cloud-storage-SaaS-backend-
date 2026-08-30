import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { searchFiles } from '../controllers/searchController';

const router = Router();

router.get('/', requireAuth, searchFiles);

export default router;