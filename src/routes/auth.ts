import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { prisma } from '../prisma/client';
import { asyncHandler } from '../middleware/asyncHandler';
import { authRequired } from '../middleware/auth';
import { hashPassword, comparePassword } from '../utils/password';
import { signJwt } from '../utils/jwt';

const router = Router();

// ------------------- Helpers -------------------
const DAYS = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
] as const;

type DayOfWeek = (typeof DAYS)[number];

const timeRegex = /^\d{2}:\d{2}$/;

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function normalizeSubdomain(sub: string) {
    return sub.trim().toLowerCase();
}

function timeToMinutes(t: string) {
    // "HH:MM" -> minutes
    const hh = Number(t.slice(0, 2));
    const mm = Number(t.slice(3, 5));
    return hh * 60 + mm;
}

function prismaUniqueMessage(err: Prisma.PrismaClientKnownRequestError) {
    // P2002 = Unique constraint failed
    // meta.target is usually like ['email'] or ['customSubdomain']
    const target = (err.meta as any)?.target as string[] | string | undefined;

    const targets = Array.isArray(target) ? target : target ? [target] : [];
    if (targets.includes('email')) return 'Email already in use';
    if (targets.includes('customSubdomain')) return 'Subdomain already in use';

    return 'Duplicate value';
}

// ------------------- Validation Schemas -------------------
const hourSchema = z.object({
    dayOfWeek: z.enum(DAYS),
    isOpen: z.boolean(),
    startTime: z.string().regex(timeRegex).nullable(),
    endTime: z.string().regex(timeRegex).nullable(),
});

const registerSchema = z
    .object({
        // user
        fullName: z.string().min(1).transform((v) => v.trim()),
        email: z.string().email().transform(normalizeEmail),
        phoneNumber: z.string().min(3).optional().transform((v) => v?.trim()),
        password: z.string().min(6),

        // business
        businessName: z.string().min(1).transform((v) => v.trim()),
        businessPhone: z.string().min(3).transform((v) => v.trim()),
        streetAddress: z.string().min(1).transform((v) => v.trim()),
        city: z.string().min(1).transform((v) => v.trim()),
        state: z.string().min(1).transform((v) => v.trim()),
        zipcode: z.string().min(3).transform((v) => v.trim()),

        customSubdomain: z
            .string()
            .min(3)
            .regex(/^[a-z0-9-]+$/)
            .transform(normalizeSubdomain),

        open24_7: z.boolean(),
        businessHours: z.array(hourSchema).length(7),
    })
    .superRefine((val, ctx) => {
        // Ensure we have exactly one entry per day
        const days = val.businessHours.map((h) => h.dayOfWeek);
        const uniqueDays = new Set(days);
        if (uniqueDays.size !== 7) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['businessHours'],
                message: 'businessHours must include exactly one entry for each day (MONDAY..SUNDAY)',
            });
            return;
        }

        // If not 24/7, require at least one open day
        if (!val.open24_7) {
            const openDays = val.businessHours.filter((h) => h.isOpen).length;
            if (openDays === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['businessHours'],
                    message: 'At least one day must be open',
                });
            }
        }

        // Validate each day hour logic:
        // - if isOpen = true and not 24/7 => start/end required and start < end
        // - if isOpen = false => start/end must be null
        for (const h of val.businessHours) {
            if (!h.isOpen) {
                if (h.startTime !== null || h.endTime !== null) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['businessHours'],
                        message: `${h.dayOfWeek}: startTime/endTime must be null when closed`,
                    });
                }
                continue;
            }

            // If open24_7, we don’t require times (but we still accept them)
            if (val.open24_7) continue;

            if (!h.startTime || !h.endTime) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['businessHours'],
                    message: `${h.dayOfWeek}: startTime and endTime are required when open`,
                });
                continue;
            }

            const start = timeToMinutes(h.startTime);
            const end = timeToMinutes(h.endTime);
            if (start >= end) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['businessHours'],
                    message: `${h.dayOfWeek}: startTime must be before endTime`,
                });
            }
        }
    });

const loginSchema = z.object({
    email: z.string().email().transform(normalizeEmail),
    password: z.string().min(1),
});

// ------------------- Routes -------------------

// REGISTER
router.post(
    '/register',
    asyncHandler(async (req, res) => {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: 'Validation failed',
                issues: parsed.error.issues,
            });
        }

        const body = parsed.data;

        try {
            const { user, biz } = await prisma.$transaction(async (tx) => {
                const user = await tx.user.create({
                    data: {
                        fullName: body.fullName,
                        email: body.email,
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
                        customSubdomain: body.customSubdomain,
                        open24_7: body.open24_7,
                    },
                });

                // If open24_7, store all days as open with null times (or keep times if you prefer)
                const hoursData = body.open24_7
                    ? DAYS.map((day) => ({
                        businessId: biz.id,
                        dayOfWeek: day as DayOfWeek,
                        isOpen: true,
                        startTime: null,
                        endTime: null,
                    }))
                    : body.businessHours.map((h) => ({
                        businessId: biz.id,
                        dayOfWeek: h.dayOfWeek,
                        isOpen: h.isOpen,
                        startTime: h.isOpen ? h.startTime : null,
                        endTime: h.isOpen ? h.endTime : null,
                    }));

                await tx.businessHours.createMany({ data: hoursData });

                return { user, biz };
            });

            const token = signJwt({
                userId: user.id,
                businessId: biz.id,
                role: 'OWNER',
            });

            return res.status(201).json({ message: 'Account created', token });
        } catch (err) {
            console.log(err)
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                const target = (err.meta as any)?.target as string[] | string | undefined;
                const fields = Array.isArray(target) ? target : target ? [target] : [];

                if (fields.includes('email')) {
                    return res.status(400).json({ message: 'Email already in use' });
                }
                if (fields.includes('customSubdomain')) {
                    return res.status(400).json({ message: 'Subdomain already in use' });
                }

                return res.status(400).json({ message: 'Duplicate value' });
            }

            throw err;
        }
    })
);

// LOGIN
router.post(
    '/login',
    asyncHandler(async (req, res) => {
        console.log("login request is coming")
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: 'Validation failed',
                issues: parsed.error.issues,
            });
        }

        const data = parsed.data;
        console.log(data)

        const user = await prisma.user.findUnique({
            where: { email: data.email.toLowerCase() },
        });

        // Don’t leak which field is wrong
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const match = await comparePassword(data.password, user.passwordHash);
        if (!match) return res.status(400).json({ message: 'Invalid credentials password not much' });

        const business = await prisma.business.findFirst({
            where: { ownerUserId: user.id },
        });

        const token = signJwt({
            userId: user.id,
            businessId: business?.id ?? null,
            role: user.role,
        });

        return res.json({ token, user, business });
    })
);

// ME
router.get(
    '/me',
    authRequired,
    asyncHandler(async (req, res) => {
        const userId = req.user!.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) return res.status(404).json({ message: 'User not found' });

        const business = await prisma.business.findFirst({
            where: { ownerUserId: user.id },
        });
        return res.json({ user, business });
    })
);

export default router;
