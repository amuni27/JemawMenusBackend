import jwt from 'jsonwebtoken';
import { env } from '../config/env';

interface JwtPayload {
  userId: string;
  businessId: string;
  role: string;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '8h' });
}

export function verifyJwt<T>(token: string): T | null {
  try {
    return jwt.verify(token, env.jwtSecret) as T;
  } catch {
    return null;
  }
}
