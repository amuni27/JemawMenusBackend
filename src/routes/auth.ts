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
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
] as const;

type DayOfWeek = (typeof DAYS)[number];

const timeHHmm = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)");


function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function normalizeSubdomain(sub: string) {
    return sub.trim().toLowerCase();
}

function timeToMinutes(t: string) {
    const hh = Number(t.slice(0, 2));
    const mm = Number(t.slice(3, 5));
    return hh * 60 + mm;
}

function prismaUniqueMessage(err: Prisma.PrismaClientKnownRequestError) {
    const target = (err.meta as any)?.target as string[] | string | undefined;
    const targets = Array.isArray(target) ? target : target ? [target] : [];

    if (targets.includes("email")) return "Email already in use";
    if (targets.includes("customSubdomain")) return "Subdomain already in use";

    return "Email or subdomain already in use";
}

// ------------------- Validation Schemas -------------------
const hourSchema = z
    .object({
        dayOfWeek: z.enum(DAYS),
        isOpen: z.boolean(),
        startTime: timeHHmm.nullable().optional(),
        endTime: timeHHmm.nullable().optional(),
    })
    .superRefine((h, ctx) => {
        // If closed => times must be null/undefined
        if (!h.isOpen) {
            if (h.startTime != null || h.endTime != null) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `${h.dayOfWeek}: startTime/endTime must be null when closed`,
                });
            }
        }
    });

const registerSchema = z
    .object({
        // user
        fullName: z.string().min(1).transform((v) => v.trim()),
        email: z.string().email().transform(normalizeEmail),
        phoneNumber: z
            .string()
            .trim()
            .min(6)
            .optional()
            .or(z.literal(""))
            .transform((v) => (v ? v.trim() : undefined)),
        password: z.string().min(6),

        // business
        businessName: z.string().min(1).transform((v) => v.trim()),
        businessPhone: z.string().min(6).transform((v) => v.trim()),

        // Ethiopia address fields (keep your DB columns)
        streetAddress: z.string().min(1).transform((v) => v.trim()),

        // Addis Ababa / Hawassa / Bahir Dar / Mekelle / etc.
        city: z.string().min(1).transform((v) => v.trim()),

        // We'll store "region" in your existing `state` column
        // Examples: "Addis Ababa", "Oromia", "Amhara", "Tigray", "Sidama", ...
        state: z.string().min(2).max(60).transform((v) => v.trim()),

        // Zipcode isn't required in Ethiopia; keep optional (stored in zipcode column)
        zipcode: z
            .string()
            .trim()
            .max(20)
            .optional()
            .or(z.literal(""))
            .transform((v) => (v ? v.trim() : "")),

        // (Optional) Ethiopia-specific details (ONLY if you want them in request)
        // You can ignore them if your DB doesn't have columns yet.
        subCity: z.string().trim().max(60).optional(),
        woreda: z.string().trim().max(30).optional(),
        kebele: z.string().trim().max(30).optional(),
        houseNumber: z.string().trim().max(30).optional(),

        // subdomain
        customSubdomain: z
            .string()
            .trim()
            .toLowerCase()
            .min(3)
            .max(30)
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid subdomain"),

        open24_7: z.boolean(),
        businessHours: z.array(hourSchema).optional().default([]),
    })
    .superRefine((val, ctx) => {
        // If NOT open24_7 => require 7 entries and validate time ranges
        if (!val.open24_7) {
            if (!val.businessHours || val.businessHours.length !== 7) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["businessHours"],
                    message: "businessHours must contain exactly 7 entries when open24_7 is false",
                });
                return;
            }

            const uniqueDays = new Set(val.businessHours.map((h) => h.dayOfWeek));
            if (uniqueDays.size !== 7) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["businessHours"],
                    message: "businessHours must include exactly one entry for each day (MONDAY..SUNDAY)",
                });
            }

            const openDays = val.businessHours.filter((h) => h.isOpen).length;
            if (openDays === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["businessHours"],
                    message: "At least one day must be open",
                });
            }

            for (const h of val.businessHours) {
                if (!h.isOpen) continue;

                if (!h.startTime || !h.endTime) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["businessHours"],
                        message: `${h.dayOfWeek}: startTime and endTime are required when open`,
                    });
                    continue;
                }

                const start = timeToMinutes(h.startTime);
                const end = timeToMinutes(h.endTime);
                if (start >= end) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["businessHours"],
                        message: `${h.dayOfWeek}: startTime must be before endTime`,
                    });
                }
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
    "/register",
    asyncHandler(async (req, res) => {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: "Validation failed",
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
                        role: "OWNER",
                    },
                });

                const biz = await tx.business.create({
                    data: {
                        ownerUserId: user.id,
                        name: body.businessName,
                        businessPhone: body.businessPhone,
                        streetAddress: body.streetAddress,
                        city: body.city,

                        // region stored in your existing "state" column
                        state: body.state,

                        // optional / not required for Ethiopia
                        zipcode: body.zipcode ?? "",

                        customSubdomain: body.customSubdomain,
                        open24_7: body.open24_7,
                    },
                });

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
                        dayOfWeek: h.dayOfWeek as DayOfWeek,
                        isOpen: h.isOpen,
                        startTime: h.isOpen ? h.startTime! : null,
                        endTime: h.isOpen ? h.endTime! : null,
                    }));

                await tx.businessHours.createMany({ data: hoursData });

                return { user, biz };
            });

            const token = signJwt({
                userId: user.id,
                businessId: biz.id,
                role: "OWNER",
            });

            return res.status(201).json({ message: "Account created", token });
        } catch (err: any) {
            console.log(err);

            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
                return res.status(400).json({ message: prismaUniqueMessage(err) });
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
