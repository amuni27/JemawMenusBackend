import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../prisma/client';
import { z } from 'zod';

const router = Router();
router.use(authRequired);

// Validation schemas
const createMenuSchema = z.object({
    menuId: z.string().uuid(),
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
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const businessId = req.user!.businessId;

        const menus = await prisma.menu.findMany({
            where: { businessId },
            orderBy: { createdAt: 'desc' },
            include: {
                menuType: true, // returns the related menuType object
            },
        });

        res.json(menus);
    })
);

// POST /api/menus
// POST /api/menus
router.post(
    "/",
    asyncHandler(async (req, res) => {
        const data = createMenuSchema.parse(req.body);
        const businessId = req.user!.businessId;

        // Check business exists
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: { id: true },
        });

        if (!business) {
            return res
                .status(404)
                .json({ message: "Business not found. Cannot create menu." });
        }

        // Validate menu type exists (optionally add businessId if menu types are business-specific)
        const menuType = await prisma.menuType.findFirst({
            where: {
                id: data.menuId,
                // businessId, // ✅ uncomment if menu types belong to a business
            },
            select: { id: true },
        });

        if (!menuType) {
            return res
                .status(400)
                .json({ message: "Invalid menu type for this business." });
        }

        const menu = await prisma.menu.create({
            data: {
                name: data.name,
                description: data.description ?? null,
                currency: data.currency,
                visibility: data.visibility ?? "PUBLIC",

                // ✅ connect business relation
                business: { connect: { id: businessId } },

                // ✅ connect menuType relation (this fixes "Argument menuType is missing")
                menuType: { connect: { id: data.menuId } },
            },
        });

        res.status(201).json(menu);
    })
);


// GET /api/menus/:menuId
router.get("/:menuId", asyncHandler(async (req, res) => {
    const businessId = req.user!.businessId;
    const { menuId } = req.params;

    const menu = await prisma.menu.findFirst({
        where: { id: menuId, businessId },
    });

    if (!menu) {
        return res.status(404).json({ message: "Menu not found" });
    }

    res.json(menu);
}));

// PATCH /api/menus/:menuId
router.patch(
    '/:menuId',
    asyncHandler(async (req: any, res) => {
        const data = updateMenuSchema.parse(req.body);

        const updated = await prisma.menu.update({
            where: { id: req.menu.id },
            data,
        });

        res.json(updated);
    })
);

// DELETE /api/menus/:menuId
router.delete(
    '/:menuId',
    asyncHandler(async (req: any, res) => {
        await prisma.$transaction([
            prisma.qRTable.deleteMany({ where: { menuId: req.menu.id } }),
            prisma.menuItem.deleteMany({ where: { menuId: req.menu.id } }),
            prisma.category.deleteMany({ where: { menuId: req.menu.id } }),
            prisma.menu.delete({ where: { id: req.menu.id } }),
        ]);

        res.status(204).send();
    })
);

router.get(
    '/type/all',
    asyncHandler(async (_req, res) => {
        console.log("hhhh")
        const menuTypes = await prisma.menuType.findMany({
            orderBy: { name: 'asc' },
        });

        res.json(menuTypes);
    })
);


export default router;
