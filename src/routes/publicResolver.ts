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

        // --- helpers: "closest to current time-of-day" ---
        const minutesSinceMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();

        const circularDiffMinutes = (a: number, b: number) => {
            const diff = Math.abs(a - b);
            return Math.min(diff, 1440 - diff);
        };

        // 2) Menus (active) + menuType (where the time is stored)
        const menusRaw = await prisma.menu.findMany({
            where: { businessId, isActive: true },
            include: {
                menuType: true, // <-- assumes relation name is "menuType"
            },
        });

        if (menusRaw.length === 0) {
            return res.json({ business, menus: [] });
        }

        const now = new Date();
        const nowMin = minutesSinceMidnight(now);

        // Sort by closest menuType.updatedAt time-of-day to now
        const menusSorted = [...menusRaw].sort((a, b) => {
            // If for any reason menuType is missing, push it to the end
            if (!a.menuType && !b.menuType) return 0;
            if (!a.menuType) return 1;
            if (!b.menuType) return -1;

            const aMin = minutesSinceMidnight(new Date(a.menuType.updatedAt));
            const bMin = minutesSinceMidnight(new Date(b.menuType.updatedAt));

            const da = circularDiffMinutes(nowMin, aMin);
            const db = circularDiffMinutes(nowMin, bMin);

            if (da !== db) return da - db;

            // tie-breaker: if same distance, prefer the one with later menuType.updatedAt
            return (
                new Date(b.menuType.updatedAt).getTime() -
                new Date(a.menuType.updatedAt).getTime()
            );
        });

        const menuIds = menusSorted.map((m) => m.id);

        // 3) Categories (active)
        const categories = await prisma.category.findMany({
            where: { menuId: { in: menuIds }, isActive: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });

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

        // 5) Assemble menus (KEEP the sorted order), but ONLY menus that still have categories
        const menusWithNested = menusSorted
            .map((menu) => ({
                ...menu,
                categories: categoriesByMenuId.get(menu.id) ?? [],
            }))
            .filter((menu) => menu.categories.length > 0);

        return res.json({
            business,
            menus: menusWithNested,
        });
    })
);

export default router;
