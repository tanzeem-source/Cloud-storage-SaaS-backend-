import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  shareWithUser,
  revokeShare,
  createLinkShare,
  openLinkShare,
} from '../controllers/shareController';

const router = Router();

router.post('/user', requireAuth, shareWithUser);
router.delete('/user/:id', requireAuth, revokeShare);
router.post('/link', requireAuth, createLinkShare);
router.post('/link/:token', requireAuth, openLinkShare); // login required, per your Day 3 decision

export default router;