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

// Helper to ensure category ownership (NO router.param)
async function getCategoryIfAuthorized(categoryId: string, businessId: string) {
  return prisma.category.findFirst({
    where: {
      id: categoryId,
      menu: { businessId }, // ensures the category belongs to user's business
    },
  });
}

// GET /api/menus/:menuId/categories
router.get(
    '/menus/:menuId/categories',
    asyncHandler(async (req, res) => {
      const menu = await getMenuIfAuthorized(req.params.menuId, req.user!.businessId);
      if (!menu) return res.status(404).json({ message: 'Menu not found' });

      const categories = await prisma.category.findMany({
        where: { menuId: menu.id },
        orderBy: { sortOrder: 'asc' },
      });

      res.json(categories);
    })
);

// POST /api/menus/:menuId/categories
router.post(
    '/menus/:menuId/categories',
    asyncHandler(async (req, res) => {
      const data = createCategorySchema.parse(req.body);

      const menu = await getMenuIfAuthorized(req.params.menuId, req.user!.businessId);
      if (!menu) return res.status(404).json({ message: 'Menu not found' });

      const category = await prisma.category.create({
        data: { ...data, menuId: menu.id },
      });

      res.status(201).json(category);
    })
);

// PATCH /api/categories/:categoryId
router.patch(
    '/categories/:categoryId',
    asyncHandler(async (req, res) => {
      const data = updateCategorySchema.parse(req.body);
      const { categoryId } = req.params;

      const category = await getCategoryIfAuthorized(categoryId, req.user!.businessId);
      if (!category) return res.status(404).json({ message: 'Category not found' });

      const updated = await prisma.category.update({
        where: { id: category.id },
        data,
      });

      res.json(updated);
    })
);

// DELETE /api/categories/:categoryId (block if items exist)
router.delete(
    '/categories/:categoryId',
    asyncHandler(async (req, res) => {
      const { categoryId } = req.params;

      const category = await getCategoryIfAuthorized(categoryId, req.user!.businessId);
      if (!category) return res.status(404).json({ message: 'Category not found' });

      const itemCount = await prisma.menuItem.count({
        where: { categoryId: category.id },
      });

      if (itemCount > 0) {
        return res.status(400).json({
          message: 'Category has items; delete items first',
        });
      }

      await prisma.category.delete({ where: { id: category.id } });
      res.status(204).send();
    })
);

// POST /api/menus/:menuId/categories/reorder
router.post(
    '/menus/:menuId/categories/reorder',
    asyncHandler(async (req, res) => {
      const { orderedIds } = reorderSchema.parse(req.body);

      const menu = await getMenuIfAuthorized(req.params.menuId, req.user!.businessId);
      if (!menu) return res.status(404).json({ message: 'Menu not found' });

      const categories = await prisma.category.findMany({
        where: { id: { in: orderedIds }, menuId: menu.id },
      });

      if (categories.length !== orderedIds.length) {
        return res.status(400).json({ message: 'One or more categories invalid' });
      }

      await prisma.$transaction(
          orderedIds.map((id, index) =>
              prisma.category.update({ where: { id }, data: { sortOrder: index } })
          )
      );

      res.json({ success: true });
    })
);

export default router;
