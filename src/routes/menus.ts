import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../prisma/client';
import { z } from 'zod';

const router = Router();
router.use(authRequired);

// Validation schemas
const createMenuSchema = z.object({
  menuTypeId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  currency: z.string().default('USD'),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
});

const updateMenuSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  currency: z.string().optional(),
  isActive: z.boolean().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
});

// GET /api/menus
router.get('/', asyncHandler(async (req, res) => {
  const menus = await prisma.menu.findMany({
    where: { businessId: req.user!.businessId },
  });
  res.json(menus);
}));

// POST /api/menus
router.post('/', asyncHandler(async (req, res) => {
  const data = createMenuSchema.parse(req.body);
  const menu = await prisma.menu.create({
    data: { ...data, businessId: req.user!.businessId },
  });
  res.status(201).json(menu);
}));

// Middleware to fetch menu by id and ensure ownership
router.param('menuId', asyncHandler(async (req, _res, next, menuId: string) => {
  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu || menu.businessId !== req.user!.businessId) {
    return next({ status: 404, message: 'Menu not found' });
  }
  req.menu = menu as any;
  next();
}));

// GET /api/menus/:menuId
router.get('/:menuId', asyncHandler(async (req, res) => {
  res.json(req.menu);
}));

// PATCH /api/menus/:menuId
router.patch('/:menuId', asyncHandler(async (req, res) => {
  const data = updateMenuSchema.parse(req.body);
  const updated = await prisma.menu.update({ where: { id: req.menu!.id }, data });
  res.json(updated);
}));

// DELETE /api/menus/:menuId
router.delete('/:menuId', asyncHandler(async (req, res) => {
  // delete related entities via transaction
  await prisma.$transaction([
    prisma.qRTable.deleteMany({ where: { menuId: req.menu!.id } }),
    prisma.menuItem.deleteMany({ where: { menuId: req.menu!.id } }),
    prisma.category.deleteMany({ where: { menuId: req.menu!.id } }),
    prisma.menu.delete({ where: { id: req.menu!.id } }),
  ]);
  res.status(204).send();
}));

export default router;
