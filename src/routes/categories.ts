import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../prisma/client';
import { z } from 'zod';

const router = Router();
router.use(authRequired);

// Schemas
const createCategorySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

// Helper to ensure menu ownership
async function getMenuIfAuthorized(menuId: string, businessId: string) {
  return prisma.menu.findFirst({ where: { id: menuId, businessId } });
}

router.param(
    'categoryId',
    asyncHandler(async (req: any, res, next, categoryId: string) => {
      const businessId = req.user!.businessId;

      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          menu: { businessId },
        },
      });

      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
        // or: throw Object.assign(new Error('Category not found'), { status: 404 });
      }

      req.category = category;
      next();
    })
);


// GET /api/menus/:menuId/categories
router.get('/menus/:menuId/categories', asyncHandler(async (req, res) => {
  const menu = await getMenuIfAuthorized(req.params.menuId, req.user!.businessId);
  if (!menu) return res.status(404).json({ message: 'Menu not found' });
  const categories = await prisma.category.findMany({ where: { menuId: menu.id }, orderBy: { sortOrder: 'asc' } });
  res.json(categories);
}));

// POST /api/menus/:menuId/categories
router.post('/menus/:menuId/categories', asyncHandler(async (req, res) => {
  const data = createCategorySchema.parse(req.body);
  const menu = await getMenuIfAuthorized(req.params.menuId, req.user!.businessId);
  if (!menu) return res.status(404).json({ message: 'Menu not found' });
  const category = await prisma.category.create({ data: { ...data, menuId: menu.id } });
  res.status(201).json(category);
}));

// PATCH /api/categories/:categoryId
router.patch('/categories/:categoryId', asyncHandler(async (req, res) => {
  const data = updateCategorySchema.parse(req.body);
  const updated = await prisma.category.update({ where: { id: (req as any).category.id }, data });
  res.json(updated);
}));

// DELETE /api/categories/:categoryId (block if items exist)
router.delete('/categories/:categoryId', asyncHandler(async (req, res) => {
  const category = (req as any).category as { id: string };
  const itemCount = await prisma.menuItem.count({ where: { categoryId: category.id } });
  if (itemCount > 0) return res.status(400).json({ message: 'Category has items; delete items first' });
  await prisma.category.delete({ where: { id: category.id } });
  res.status(204).send();
}));

// POST /api/menus/:menuId/categories/reorder
router.post('/menus/:menuId/categories/reorder', asyncHandler(async (req, res) => {
  const { orderedIds } = reorderSchema.parse(req.body);
  const menu = await getMenuIfAuthorized(req.params.menuId, req.user!.businessId);
  if (!menu) return res.status(404).json({ message: 'Menu not found' });

  // Ensure all ids belong to the menu
  const categories = await prisma.category.findMany({ where: { id: { in: orderedIds }, menuId: menu.id } });
  if (categories.length !== orderedIds.length) {
    return res.status(400).json({ message: 'One or more categories invalid' });
  }
  // Update sortOrder sequentially
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.category.update({ where: { id }, data: { sortOrder: index } })
  ));
  res.json({ success: true });
}));

export default router;
