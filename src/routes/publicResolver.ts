import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../prisma/client';
import { z } from 'zod';

const router = Router();

router.get('/q/:code', asyncHandler(async (req, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.params);
  const redirectFlag = z.string().optional().parse(req.query.redirect as string | undefined);

  const qr = await prisma.qRTable.findFirst({ where: { code, isActive: true, menu: { isActive: true } }, include: { menu: { include: { vendor: true } } } });
  if (!qr) return res.status(404).json({ message: 'QR not found' });

  const { menu } = qr;
  const { vendor } = menu;
  const targetUrl = vendor.customDomain
    ? `https://${vendor.customDomain}/menu/${menu.id}?t=${qr.code}`
    : `https://${vendor.slug}.yourdomain.com/menu/${menu.id}?t=${qr.code}`;

  if (redirectFlag === '1') {
    return res.redirect(302, targetUrl);
  }

  res.json({ menuId: menu.id, vendorSlug: vendor.slug, customDomain: vendor.customDomain, targetUrl, label: qr.label });
}));

export default router;
