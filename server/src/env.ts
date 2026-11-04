import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load .env from cwd and check relative locations
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
try {
  const here = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(here, '../.env') });
  dotenv.config({ path: path.resolve(here, '../../.env') });
  dotenv.config({ path: path.resolve(here, '../../../.env') });
} catch {
  // Ignored in non-file environments
}

const envBoolean = (defaultValue = false) =>
  z.preprocess((val) => {
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes') return true;
      if (s === 'false' || s === '0' || s === 'no' || s === '') return false;
    }
    return val === undefined ? defaultValue : Boolean(val);
  }, z.boolean());

const optionalEnvBoolean = () =>
  z.preprocess((val) => {
    if (val === undefined || val === '') return undefined;
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes') return true;
      if (s === 'false' || s === '0' || s === 'no') return false;
    }
    return Boolean(val);
  }, z.boolean().optional());

/**
 * Fails fast on boot if the environment is incomplete. A server that starts
 * with a missing JWT secret is worse than one that refuses to start.
 */
const isProdEnv = process.env.NODE_ENV === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: isProdEnv
    ? z.string().min(1, 'MONGODB_URI is required in production')
    : z.string().default('mongodb://127.0.0.1:27017/dristix'),
  /** Logical database name, kept separate from the URI so one URI can host
   *  several environments without rewriting the connection string. */
  MONGODB_DB: z.string().min(1).default('dristix'),

  JWT_SECRET: isProdEnv
    ? z.string().min(32, 'JWT_SECRET must be at least 32 characters in production')
    : z.string().default('dristix-super-secure-dev-jwt-secret-key-32-chars-minimum'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900), // 15 minutes
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),

  /** When set, self-registration is rejected without a valid invite code. */
  INVITE_CODES: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),

  /** Proxy targets. Absent keys simply disable that provider. */
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  /** Serve the built frontend from ./dist in production. */
  SERVE_STATIC: envBoolean(false),

  /** Optional HTTPS-based transactional email providers (bypasses cloud SMTP egress firewalls like Render free tier). */
  BREVO_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  /** Optional SMTP mailer configuration for sending password reset emails. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: optionalEnvBoolean(),
  EMAIL_FROM: z.string().default('DristiX Security <noreply@dristix.edu>'),
  CLIENT_URL: z.string().default(process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid server environment:\n');
  for (const issue of parsed.error.issues) {
    console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nCopy server/.env.example to server/.env and fill it in.\n');
  console.error('The MongoDB database name is separate from your other local databases.\n');
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  inviteCodes: raw.INVITE_CODES
    ? raw.INVITE_CODES.split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    : null,
};
