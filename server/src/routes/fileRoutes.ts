import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  uploadFile,
  renameFile,
  deleteFile,
  restoreFile,
  getTrash,
  permanentlyDeleteFile,
} from '../controllers/fileController';

const router = Router();

router.post('/upload', requireAuth, upload.single('file'), uploadFile);
router.patch('/:id/rename', requireAuth, renameFile);
router.delete('/:id', requireAuth, deleteFile);
router.patch('/:id/restore', requireAuth, restoreFile);
router.get('/trash', requireAuth, getTrash);
router.delete('/:id/permanent', requireAuth, permanentlyDeleteFile);

export default router;