import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from '../env.js';
import type { UserDoc } from '../models/User.js';
import type { UserProfile } from '../../../shared/types.js';

const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface AccessTokenPayload {
  sub: string;
  role: 'STUDENT' | 'ADMIN';
}

export function signAccessToken(user: {
  _id: unknown;
  role?: string | null;
}): string {
  return jwt.sign(
    { sub: String(user._id), role: user.role ?? 'STUDENT' },
    env.JWT_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL }
  );
}

export function signRefreshToken(user: {
  _id: unknown;
  role?: string | null;
}): string {
  return jwt.sign(
    { sub: String(user._id), role: user.role ?? 'STUDENT', type: 'refresh' },
    env.JWT_SECRET,
    { expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    return payload;
  } catch {
    return null;
  }
}

export const REFRESH_COOKIE = 'dristix_refresh';

export function setRefreshCookie(res: Response, user: { _id: unknown; role?: string | null }): void {
  const token = signRefreshToken(user);
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    // Cross-origin setups (Vercel frontend -> Render backend) require 'none' + secure in production.
    sameSite: env.isProd ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    path: '/api/auth',
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
  });
}

export function toUserProfile(user: UserDoc): UserProfile {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    rollNumber: user.rollNumber,
    role: user.role as UserProfile['role'],
    accessibilityPreference:
      (user.accessibilityPreference as UserProfile['accessibilityPreference']) ?? null,
  };
}
