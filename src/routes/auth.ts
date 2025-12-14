import { Router } from 'express';
import { prisma } from '../prisma/client';
import { asyncHandler } from '../middleware/asyncHandler';
import { hashPassword, comparePassword } from '../utils/password';
import { signJwt } from '../utils/jwt';
import { z } from 'zod';
import { authRequired } from '../middleware/auth';

const router = Router();

// ------------------- Validation Schemas -------------------
const hourSchema = z.object({
  dayOfWeek: z.enum([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ]),
  isOpen: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

const registerSchema = z.object({
  // user
  fullName: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().min(3).optional(),
  password: z.string().min(6),
  // business
  businessName: z.string().min(1),
  businessPhone: z.string().min(3),
  streetAddress: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zipcode: z.string().min(3),
  customSubdomain: z.string().regex(/^[a-z0-9-]+$/).min(3),
  open24_7: z.boolean(),
  businessHours: z.array(hourSchema).length(7),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
// -----------------------------------------------------------

// REGISTER
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    // Duplicate checks
    const [dupeEmail, dupeSub] = await prisma.$transaction([
      prisma.user.findUnique({ where: { email: body.email.toLowerCase() } }),
      prisma.business.findUnique({ where: { customSubdomain: body.customSubdomain.toLowerCase() } }),
    ]);
    if (dupeEmail)
      return res.status(400).json({ message: 'Email already in use' });
    if (dupeSub)
      return res.status(400).json({ message: 'Subdomain already in use' });

    if (!body.open24_7) {
      const openDays = body.businessHours.filter((h) => h.isOpen).length;
      if (openDays === 0)
        return res
          .status(400)
          .json({ message: 'At least one day must be open' });
    }

    // Transactional create
    const { user, biz } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: body.fullName,
          email: body.email.toLowerCase(),
          phoneNumber: body.phoneNumber,
          passwordHash: await hashPassword(body.password),
          role: 'OWNER',
        },
      });

      const biz = await tx.business.create({
        data: {
          ownerUserId: user.id,
          name: body.businessName,
          businessPhone: body.businessPhone,
          streetAddress: body.streetAddress,
          city: body.city,
          state: body.state,
          zipcode: body.zipcode,
          customSubdomain: body.customSubdomain.toLowerCase(),
          open24_7: body.open24_7,
        },
      });

      await tx.businessHours.createMany({
        data: body.businessHours.map((h) => ({
          businessId: biz.id,
          dayOfWeek: h.dayOfWeek,
          isOpen: h.isOpen,
          startTime: h.startTime,
          endTime: h.endTime,
        })),
      });

      return { user, biz };
    });

    const token = signJwt({
      userId: user.id,
      businessId: biz.id,
      role: 'OWNER',
    });
    res.status(201).json({ message: 'Account created', token });
  })
);

// LOGIN
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (!user)
      return res.status(400).json({ message: 'Invalid credentials' });

    const match = await comparePassword(data.password, user.passwordHash);
    if (!match)
      return res.status(400).json({ message: 'Invalid credentials' });

    // Find owner business (may be null for STAFF, etc.)
    const biz = await prisma.business.findFirst({
      where: { ownerUserId: user.id },
      select: { id: true },
    });

    const token = signJwt({
      userId: user.id,
      businessId: biz?.id ?? null,
      role: user.role,
    });

    res.json({ token });
  })
);

// ME
router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, fullName: true, role: true },
    });
    res.json({ ...user, businessId: req.user!.businessId });
  })
);

export default router;
