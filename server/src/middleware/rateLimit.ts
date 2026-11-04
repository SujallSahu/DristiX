import rateLimit from 'express-rate-limit';
import { env } from '../env.js';

const jsonMessage = (message: string) => ({ error: 'rate_limited', message });

/** Generous ceiling for normal API traffic. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Too many requests. Please slow down.'),
});

/**
 * Tight limit on credential endpoints. This is the main brute-force defence —
 * password hashing alone does not stop an attacker who can try millions of
 * guesses quickly.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProd ? 60 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: jsonMessage('Too many attempts. Try again in a few minutes.'),
});

/**
 * The AI proxy spends real money per call, so it gets its own budget.
 * Rate limited per authenticated user where possible.
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isProd ? 30 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: jsonMessage('Voice assistant request limit reached. Please wait a moment.'),
});
