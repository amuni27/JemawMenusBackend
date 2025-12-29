import {Router, Request, Response, NextFunction} from 'express';
import {authRequired} from '../middleware/auth';
import {asyncHandler} from '../middleware/asyncHandler';
import {prisma} from '../prisma/client';
import {z} from 'zod';
import {Prisma} from "@prisma/client";

const router = Router();
router.use(authRequired);

// Utility: ensure menu belongs to vendor
async function getMenuIfAuthorized(menuId: string, businessId: string) {
    const menu = await prisma.menu.findUnique({where: {id: menuId}});
    if (!menu || menu.businessId !== businessId) return null;
    return menu;
}

// Utility: ensure item belongs to vendor (via menu)
async function getItemIfAuthorized(itemId: string, businessId: string) {
    return prisma.menuItem.findFirst({
        where: {id: itemId, menu: {businessId}},
    });
}

function ingredientsSchema() {
    return z.array(z.string().trim().min(1)).min(1).refine(arr => {
        const lower = arr.map(i => i.toLowerCase());
        return new Set(lower).size === lower.length;
    }, {message: 'ingredients must be unique (case-insensitive)'});
}

const moneyNumber = z
    .coerce
    .number()
    .finite()
    .nonnegative()
    .transform((n) => {
        // normalize to 2 decimals without float drift
        const cents = Math.round(n * 100);
        return cents / 100;
    });
const baseFields = {
    name: z.string().min(1),
    price: moneyNumber,

    imageUrl: z
        .string()
        .trim()
        .nullable()
        .optional()
        .transform((v) => {
            if (!v) return null;
            // allow user typing "abc.com" and normalize
            if (!/^https?:\/\//i.test(v)) return `https://${v}`;
            return v;
        })
        .refine((v) => v === null || /^https?:\/\/.+/i.test(v), {
            message: "Invalid url",
        }),
    categoryId: z.string().uuid(),
    ingredients: ingredientsSchema(),
    description: z.string().nullable().optional(),
    calories: z.number().int().min(0).nullable().optional(),
    allergens: z.array(z.string()).nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
    isFeatured: z.boolean().optional(),
    prepTimeMinutes: z.number().int().min(0).nullable().optional(),
    spiceLevel: z.enum(['NONE', 'MILD', 'MEDIUM', 'HOT']).nullable().optional(),
    status: z.enum(['AVAILABLE', 'UNAVAILABLE']).optional(),
};

const createItemSchema = z.object(baseFields);
const updateItemSchema = z.object({...Object.fromEntries(Object.entries(baseFields).map(([k, v]) => [k, (v as any).optional ? v : (v as z.ZodTypeAny).optional()]))});

const statusSchema = z.object({status: z.enum(['AVAILABLE', 'UNAVAILABLE'])});

// GET /api/menus/:menuId/items
router.get('/menus/:menuId/items', asyncHandler(async (req, res) => {
    const menuId = req.params.menuId;
    const businessId = req.user!.businessId
    if (!businessId) {
        return res.status(403).json({message: "business not found"});
    }
    const menu = await getMenuIfAuthorized(menuId, businessId);
    if (!menu) return res.status(404).json({message: 'Menu not found'});

    const querySchema = z.object({
        categoryId: z.string().uuid().optional(),
        status: z.enum(['AVAILABLE', 'UNAVAILABLE']).optional(),
        search: z.string().optional(),
    });
    const {categoryId, status, search} = querySchema.parse(req.query);

    const items = await prisma.menuItem.findMany({
        where: {
            menuId,
            ...(categoryId ? {categoryId} : {}),
            ...(status ? {status} : {}),
            ...(search ? {
                OR: [
                    {name: {contains: search, mode: 'insensitive'}},
                    {description: {contains: search, mode: 'insensitive'}},
                ],
            } : {}),
        },
        orderBy: [{sortOrder: 'asc'}, {createdAt: 'desc'}],
    });
    res.json(items);
}));

// POST /api/menus/:menuId/items
router.post(
    "/menus/:menuId/items",
    asyncHandler(async (req: any, res) => {
        console.log("➡️ POST /menus/:menuId/items");
        console.log("menuId:", req.params.menuId);
        console.log("user.businessId:", req.user?.businessId);

        console.log("📦 RAW BODY:", JSON.stringify(req.body, null, 2));

        const menuId = req.params.menuId;

        // 1️⃣ AUTH / MENU CHECK
        console.log("🔎 Checking menu authorization...");
        const menu = await getMenuIfAuthorized(menuId, req.user!.businessId);
        console.log("menu found:", !!menu);

        if (!menu) {
            console.log("❌ Menu not found or unauthorized");
            return res.status(404).json({message: "Menu not found"});
        }

        // 2️⃣ ZOD PARSE
        console.log("🧪 Parsing request body with createItemSchema...");
        let data;
        try {
            data = createItemSchema.parse(req.body);
            console.log("✅ Zod parse OK:", data);
        } catch (e) {
            console.error("❌ Zod parse FAILED");
            throw e; // let errorHandler handle it
        }

        // 3️⃣ CATEGORY CHECK
        console.log("🔎 Checking category:", data.categoryId);
        const category = await prisma.category.findUnique({
            where: {id: data.categoryId},
            select: {id: true, menuId: true},
        });

        console.log("category:", category);

        if (!category || category.menuId !== menuId) {
            console.log("❌ Category does not belong to menu");
            return res.status(400).json({message: "categoryId must belong to the menu"});
        }

        // 4️⃣ SORT ORDER
        console.log("📊 Calculating sortOrder...");
        const maxSort = await prisma.menuItem.aggregate({
            where: {menuId, categoryId: data.categoryId},
            _max: {sortOrder: true},
        });

        console.log("maxSort:", maxSort);

        const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
        console.log("sortOrder:", sortOrder);

        // 5️⃣ PRICE CONVERSION
        let priceDecimal;
        try {
            const cents = Math.round(data.price * 100);
            priceDecimal = new Prisma.Decimal((cents / 100).toFixed(2));
            console.log("💰 priceDecimal:", priceDecimal.toString());
        } catch (e) {
            console.error("❌ Price conversion failed:", data.price);
            throw e;
        }

        // 6️⃣ CREATE ITEM
        console.log("📝 Creating menu item...");
        const item = await prisma.menuItem.create({
            data: {
                menuId,
                categoryId: data.categoryId,
                name: data.name,
                description: data.description ?? null,

                price: priceDecimal,

                calories: data.calories ?? null,
                imageUrl: data.imageUrl ?? null,

                ingredients: (data.ingredients ?? []) as any,
                allergens: (data.allergens ?? null) as any,
                tags: (data.tags ?? null) as any,

                status: data.status ?? "AVAILABLE",
                isFeatured: data.isFeatured ?? false,
                prepTimeMinutes: data.prepTimeMinutes ?? null,
                spiceLevel: data.spiceLevel ?? null,

                sortOrder,
                updatedAt: new Date(),
            },
        });

        console.log("✅ Item created successfully:", item.id);

        return res.status(201).json(item);
    })
);

// Middleware for itemId param
router.param("itemId", async (req: Request, _res: Response, next: NextFunction, itemId: string) => {
    const businessId = req.user!.businessId;
    if (!businessId) {
        return _res.status(403).json({message: "business not found"});
    }
    const item = await getItemIfAuthorized(itemId, businessId);

    if (!item) return next({status: 404, message: 'Item not found'});
    (req as any).item = item;
    next();
});

// GET /api/items/:itemId
router.get('/items/:itemId', asyncHandler(async (req, res) => {
    res.json((req as any).item);
}));

// PATCH /api/items/:itemId
router.put('/items/:itemId', asyncHandler(async (req, res) => {
    const data = updateItemSchema.parse(req.body);
    const item = (req as any).item as any;

    if (data.categoryId) {
        const category = await prisma.category.findUnique({where: {id: data.categoryId}});
        if (!category || category.menuId !== item.menuId) {
            return res.status(400).json({message: 'categoryId must belong to the same menu'});
        }
    }
    const updated = await prisma.menuItem.update({where: {id: item.id}, data});
    res.json(updated);
}));

// PATCH /api/items/:itemId/status
router.put(
    "/items/:itemId/status",
    asyncHandler(async (req, res) => {
        const {itemId} = req.params;
        const {status} = statusSchema.parse(req.body);

        // ✅ find the item explicitly
        const item = await prisma.menuItem.findUnique({
            where: {id: itemId},
        });

        if (!item) {
            return res.status(404).json({message: "Item not found"});
        }

        const updated = await prisma.menuItem.update({
            where: {id: itemId},
            data: {status},
        });

        res.json(updated);
    })
);

// DELETE /api/items/:itemId
router.delete('/items/:itemId', asyncHandler(async (req, res) => {
    const item = (req as any).item as any;
    await prisma.menuItem.delete({where: {id: item.id}});
    res.status(204).send();
}));

export default router;
