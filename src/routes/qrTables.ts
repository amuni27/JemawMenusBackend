import {Router} from 'express';
import {authRequired} from '../middleware/auth';
import {asyncHandler} from '../middleware/asyncHandler';
import {prisma} from '../prisma/client';
import {z} from 'zod';
import {generateCode} from '../utils/randomCode';
import {Request, Response, NextFunction} from "express";

const router = Router();
router.use(authRequired);

async function getMenuAuthorized(menuId: string, businessId: string) {
    const menu = await prisma.menu.findUnique({where: {id: menuId}});
    if (!menu || menu.businessId !== businessId) return null;
    return menu;
}

async function getQrAuthorized(id: string, businessId: string) {
    return prisma.qRTable.findFirst({
        where: {id, menu: {businessId}},
    });
}

const createSchema = z.object({label: z.string().min(1)});
const updateSchema = z.object({label: z.string().min(1).optional(), isActive: z.boolean().optional()});

// GET /api/menus/:menuId/qr-tables
router.get('/menus/:menuId/qr-tables', asyncHandler(async (req, res, next) => {
    if (!req.user?.businessId) {
        return next({ status: 403, message: "Business required" });
    }
    const menu = await getMenuAuthorized(req.params.menuId, req.user.businessId);
    if (!menu) return res.status(404).json({message: 'Menu not found'});
    const qrTables = await prisma.qRTable.findMany({where: {menuId: menu.id}, orderBy: {createdAt: 'desc'}});
    res.json(qrTables);
}));

// POST /api/menus/:menuId/qr-tables
router.post('/menus/:menuId/qr-tables', asyncHandler(async (req, res, next) => {

    if (!req.user?.businessId) {
        return next({ status: 403, message: "Business required" });
    }
    const menu = await getMenuAuthorized(req.params.menuId, req.user!.businessId);
    if (!menu) return res.status(404).json({message: 'Menu not found'});
    const {label} = createSchema.parse(req.body);

    // generate unique code with retries
    let code: string = '';
    for (let i = 0; i < 5; i++) {
        code = generateCode(8 + i); // increase length if collisions
        const existing = await prisma.qRTable.findUnique({where: {code}});
        if (!existing) break;
    }

    const qr = await prisma.qRTable.create({data: {menuId: menu.id, label, code}});
    res.status(201).json(qr);
}));

// Middleware for qr table param
router.param('qrId',
    async (req: Request, _res: Response, next: NextFunction, qrId: string) => {
        if (!req.user?.businessId) {
            return next({status: 403, message: "Business required"});
        }
        const qr = await getQrAuthorized(qrId, req.user.businessId);
        if (!qr) return next({status: 404, message: 'QR Table not found'});
        (req as any).qr = qr;
        next();
    });

// PATCH /api/qr-tables/:qrId
router.patch('/qr-tables/:qrId', asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const updated = await prisma.qRTable.update({where: {id: (req as any).qr.id}, data});
    res.json(updated);
}));

// DELETE /api/qr-tables/:qrId
router.delete('/qr-tables/:qrId', asyncHandler(async (req, res) => {
    await prisma.qRTable.delete({where: {id: (req as any).qr.id}});
    res.status(204).send();
}));

export default router;
