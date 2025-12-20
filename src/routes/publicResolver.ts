import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { prisma } from "../prisma/client";
import { z } from "zod";

const router = Router();

router.get(
    "/:businessId/menu",
    asyncHandler(async (req, res) => {
        const { businessId } = z
            .object({ businessId: z.string().min(1) })
            .parse(req.params);

        // 1) Business
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
                businessPhone: true,
                streetAddress: true,
                city: true,
                state: true,
                zipcode: true,
                customSubdomain: true,
                open24_7: true,
            },
        });

        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }

        // 2) Menus (active)
        const menus = await prisma.menu.findMany({
            where: { businessId, isActive: true },
            orderBy: [{ createdAt: "asc" }],
        });

        if (menus.length === 0) {
            return res.json({ business, menus: [] });
        }

        const menuIds = menus.map((m) => m.id);

        // 3) Categories (active)
        const categories = await prisma.category.findMany({
            where: { menuId: { in: menuIds }, isActive: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });

        // If no categories, customer sees no menus
        if (categories.length === 0) {
            return res.json({ business, menus: [] });
        }

        const categoryIds = categories.map((c) => c.id);

        // 4) Items (AVAILABLE only)
        const items = await prisma.menuItem.findMany({
            where: {
                menuId: { in: menuIds },
                categoryId: { in: categoryIds },
                status: "AVAILABLE",
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });

        // --- Build itemsByCategoryId ---
        const itemsByCategoryId = new Map<string, any[]>();
        for (const item of items) {
            const arr = itemsByCategoryId.get(item.categoryId) ?? [];
            arr.push(item);
            itemsByCategoryId.set(item.categoryId, arr);
        }

        // --- Only keep categories that have items ---
        const categoriesWithItems = categories
            .map((cat) => ({
                ...cat,
                items: itemsByCategoryId.get(cat.id) ?? [],
            }))
            .filter((cat) => cat.items.length > 0);

        // --- Group categories by menu ---
        const categoriesByMenuId = new Map<string, any[]>();
        for (const cat of categoriesWithItems) {
            const arr = categoriesByMenuId.get(cat.menuId) ?? [];
            arr.push(cat);
            categoriesByMenuId.set(cat.menuId, arr);
        }

        // 5) Assemble menus, but ONLY menus that still have categories
        const menusWithNested = menus
            .map((menu) => ({
                ...menu,
                categories: categoriesByMenuId.get(menu.id) ?? [],
            }))
            .filter((menu) => menu.categories.length > 0);

        // If all menus became empty after filtering, return empty
        return res.json({
            business,
            menus: menusWithNested,
        });
    })
);

export default router;
