import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { uploadFile } from '../controllers/fileController';

const router = Router();

router.post('/upload', requireAuth, upload.single('file'), uploadFile);

export default router;