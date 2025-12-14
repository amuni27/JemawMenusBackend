import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt';
import { prisma } from '../prisma/client';

export const authRequired = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next({ status: 401, message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const payload = verifyJwt<{ userId: string }>(token);
  if (!payload) return next({ status: 401, message: 'Invalid token' });

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return next({ status: 401, message: 'User not found' });

  const biz = await prisma.business.findFirst({ where: { ownerUserId: user.id }, select: { id: true } });
  req.user = { id: user.id, businessId: biz?.id ?? null, role: user.role };
  next();
};
