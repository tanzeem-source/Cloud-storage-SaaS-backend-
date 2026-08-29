import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createFolder,
  getFolderContents,
  renameFolder,
  deleteFolder,
  restoreFolder,
} from '../controllers/folderController'

const router = Router();

router.post('/', requireAuth, createFolder);
router.get('/:id', requireAuth, getFolderContents); // use 'root' for top-level
router.patch('/:id/rename', requireAuth, renameFolder);
router.delete('/:id', requireAuth, deleteFolder);
router.patch('/:id/restore', requireAuth, restoreFolder);

export default router;