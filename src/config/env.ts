import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required env var ${key}`);
  }
  return value;
}

export const env = {
  port: parseInt(getEnv('PORT', '3000'), 10),
  jwtSecret: getEnv('JWT_SECRET', 'supersecret'),
  databaseUrl: getEnv('DATABASE_URL'),
};
