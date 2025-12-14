import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../prisma/client';
import { z } from 'zod';

const router = Router();
router.use(authRequired);

// Utility: ensure menu belongs to vendor
async function getMenuIfAuthorized(menuId: string, businessId: string) {
  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu || menu.businessId !== businessId) return null;
  return menu;
}

// Utility: ensure item belongs to vendor (via menu)
async function getItemIfAuthorized(itemId: string, businessId: string) {
  return prisma.menuItem.findFirst({
    where: { id: itemId, menu: { businessId } },
  });
}

function ingredientsSchema() {
  return z.array(z.string().trim().min(1)).min(1).refine(arr => {
    const lower = arr.map(i => i.toLowerCase());
    return new Set(lower).size === lower.length;
  }, { message: 'ingredients must be unique (case-insensitive)' });
}

const baseFields = {
  name: z.string().min(1),
  price: z.number().min(0),
  categoryId: z.string().uuid(),
  ingredients: ingredientsSchema(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  calories: z.number().int().min(0).nullable().optional(),
  allergens: z.array(z.string()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  isFeatured: z.boolean().optional(),
  prepTimeMinutes: z.number().int().min(0).nullable().optional(),
  spiceLevel: z.enum(['NONE', 'MILD', 'MEDIUM', 'HOT']).nullable().optional(),
  status: z.enum(['AVAILABLE', 'UNAVAILABLE']).optional(),
};

const createItemSchema = z.object(baseFields);
const updateItemSchema = z.object({ ...Object.fromEntries(Object.entries(baseFields).map(([k,v])=>[k,(v as any).optional? v : (v as z.ZodTypeAny).optional()])) });

const statusSchema = z.object({ status: z.enum(['AVAILABLE', 'UNAVAILABLE']) });

// GET /api/menus/:menuId/items
router.get('/menus/:menuId/items', asyncHandler(async (req, res) => {
  const menuId = req.params.menuId;
  const menu = await getMenuIfAuthorized(menuId, req.user!.businessId);
  if (!menu) return res.status(404).json({ message: 'Menu not found' });

  const querySchema = z.object({
    categoryId: z.string().uuid().optional(),
    status: z.enum(['AVAILABLE', 'UNAVAILABLE']).optional(),
    search: z.string().optional(),
  });
  const { categoryId, status, search } = querySchema.parse(req.query);

  const items = await prisma.menuItem.findMany({
    where: {
      menuId,
      ...(categoryId ? { categoryId } : {}),
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(items);
}));

// POST /api/menus/:menuId/items
router.post('/menus/:menuId/items', asyncHandler(async (req, res) => {
  const menuId = req.params.menuId;
  const menu = await getMenuIfAuthorized(menuId, req.user!.businessId);
  if (!menu) return res.status(404).json({ message: 'Menu not found' });

  const data = createItemSchema.parse(req.body);

  // category must belong to same menu
  const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!category || category.menuId !== menuId) {
    return res.status(400).json({ message: 'categoryId must belong to the menu' });
  }

  // compute next sortOrder within that category
  const maxSort = await prisma.menuItem.aggregate({ where: { categoryId: data.categoryId }, _max: { sortOrder: true } });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const item = await prisma.menuItem.create({
    data: {
      ...data,
      menuId,
      sortOrder,
      ingredients: data.ingredients as any,
      allergens: data.allergens as any,
      tags: data.tags as any,
    },
  });
  res.status(201).json(item);
}));

// Middleware for itemId param
router.param('itemId',
  asyncHandler(async (req, _res, next, itemId: string) => {
    const item = await getItemIfAuthorized(itemId, req.user!.businessId);
    if (!item) return next({ status: 404, message: 'Item not found' });
    (req as any).item = item;
    next();
}));

// GET /api/items/:itemId
router.get('/items/:itemId', asyncHandler(async (req, res) => {
  res.json((req as any).item);
}));

// PATCH /api/items/:itemId
router.patch('/items/:itemId', asyncHandler(async (req, res) => {
  const data = updateItemSchema.parse(req.body);
  const item = (req as any).item as any;

  if (data.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category || category.menuId !== item.menuId) {
      return res.status(400).json({ message: 'categoryId must belong to the same menu' });
    }
  }
  const updated = await prisma.menuItem.update({ where: { id: item.id }, data });
  res.json(updated);
}));

// PATCH /api/items/:itemId/status
router.patch('/items/:itemId/status', asyncHandler(async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const item = (req as any).item as any;
  const updated = await prisma.menuItem.update({ where: { id: item.id }, data: { status } });
  res.json(updated);
}));

// DELETE /api/items/:itemId
router.delete('/items/:itemId', asyncHandler(async (req, res) => {
  const item = (req as any).item as any;
  await prisma.menuItem.delete({ where: { id: item.id } });
  res.status(204).send();
}));

export default router;
