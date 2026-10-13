
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Prioritize IPv4 resolution globally for all Node network requests.
// On networks with IPv6 translation prefixes (NAT64 / 64:ff9b::), MongoDB Atlas shard hostnames
// fail with getaddrinfo ENOTFOUND unless IPv4 is explicitly preferred.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignored on older Node runtimes
}

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env.js';
import { connectDb, disconnectDb } from './db.js';
import { aiRouter } from './routes/ai.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { attemptRouter } from './routes/attempts.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { examRouter } from './routes/exams.routes.js';
import { feedbackRouter } from './routes/feedback.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';

const app = express();

// ── Process-level safety net ────────────────────────────────────────
// A transient database blip (Atlas connections reset every so often) must
// surface as a 500 on the offending request, never as a dead server: every
// rejection that slips past a route/middleware wrapper would otherwise take
// the process down and every later request would fail with ECONNREFUSED.
process.on('unhandledRejection', (reason) => {
  console.error('[dristix] unhandled promise rejection (server kept alive):', reason);
});

process.on('uncaughtException', (err) => {
  // Logged rather than fatal: by the time this fires the request that caused
  // it has already been answered or abandoned, and Express keeps serving.
  console.error('[dristix] uncaught exception (server kept alive):', err);
});

// ── Security headers ────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(
  helmet({
    // The API serves JSON and (optionally) static assets; a restrictive CSP is
    // set only when we serve the frontend ourselves.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

function isOriginAllowed(origin: string): boolean {
  return env.corsOrigins.some((allowed) => {
    if (allowed === origin) return true;
    if (allowed.includes('*')) {
      const escaped = allowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(`^${escaped}$`).test(origin);
    }
    return false;
  });
}

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header means a same-origin or non-browser request.
      if (!origin) return callback(null, true);

      // Returning false rather than throwing is deliberate: the request is
      // served without CORS headers so the browser blocks it. Throwing here
      // would surface as a 500 and log a stack trace on every rejected
      // cross-origin request — noise rather than security.
      return callback(null, isOriginAllowed(origin));
    },
    credentials: true, // required for the refresh cookie
  })
);

// Images attached to a question travel as base64 data URLs — a single photo
// is easily 1–4 MB once encoded, so 1 MB rejected every real upload with an
// opaque 500. Generous enough for a diagram, still bounded so a runaway body
// cannot pin memory.
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use('/api', apiLimiter);

// ── Routes ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'dristix-api', env: env.NODE_ENV });
});

app.use('/api/auth', authRouter);
app.use('/api/exams', examRouter);
app.use('/api/attempts', attemptRouter);
app.use('/api/admin', adminRouter);
app.use('/api/ai', aiRouter);
app.use('/api/feedback', feedbackRouter);

// ── Optional: serve the built frontend as a single deployable unit ──
if (env.SERVE_STATIC) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(here, '../../../../dist'),
    path.resolve(here, '../../dist'),
    path.resolve(here, '../dist'),
  ];
  const dist = candidatePaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidatePaths[0];
  console.log(`[dristix] Serving static client build from: ${dist}`);
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use('/api', notFound);
app.use(errorHandler);

// ── Boot ────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    await connectDb();
  } catch (err) {
    console.error('\n❌ Could not connect to MongoDB.');
    console.error(`   ${err instanceof Error ? err.message : String(err)}\n`);
    console.error('   Check MONGODB_URI in server/.env and that mongod is running.\n');
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`\n  DristiX API listening on http://localhost:${env.PORT}`);
    console.log(`  mode: ${env.NODE_ENV}`);
    console.log(
      `  AI providers: gemini=${Boolean(env.GEMINI_API_KEY)} groq=${Boolean(env.GROQ_API_KEY)}`
    );
    console.log(`  registration: ${env.inviteCodes ? 'invite-only' : 'open'}\n`);
  });

  // Without this, a port clash surfaces as an unhandled 'error' event and a raw
  // Node stack trace. A clear message is far more useful than a crash dump.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n❌ Port ${env.PORT} is already in use.\n` +
        `   Another DristiX server is probably still running. Stop it, or set PORT in server/.env.\n`
      );
    } else {
      console.error(`\n❌ Server error: ${err.message}\n`);
    }
    process.exit(1);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void start();
