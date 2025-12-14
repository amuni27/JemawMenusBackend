import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import authRoutes from './auth';
import menuRoutes from './menus';
import categoryRoutes from './categories';
import itemRoutes from './items';
import qrRoutes from './qrTables';
import publicResolver from './publicResolver';

const router = Router();

router.get('/health', asyncHandler(async (_req, res) => {
  res.json({ status: 'ok' });
}));

router.use('/auth', authRoutes);
router.use('/menus', menuRoutes);
router.use(categoryRoutes);
router.use(itemRoutes);
router.use(qrRoutes);
router.use(publicResolver);

export default router;
