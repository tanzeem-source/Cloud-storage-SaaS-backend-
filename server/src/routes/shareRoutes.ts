import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  shareWithUser,
  revokeShare,
  createLinkShare,
  openLinkShare,
  listShares,
  updateShareRole,
  revokeLinkShare,
} from '../controllers/shareController';

const router = Router();

router.post('/user', requireAuth, shareWithUser);
router.patch('/user/:id', requireAuth, updateShareRole);
router.delete('/user/:id', requireAuth, revokeShare);
router.post('/link', requireAuth, createLinkShare);
router.delete('/link/:id', requireAuth, revokeLinkShare);
router.post('/link/:token', requireAuth, openLinkShare);
router.get('/:resourceType/:resourceId', requireAuth, listShares);

export default router;