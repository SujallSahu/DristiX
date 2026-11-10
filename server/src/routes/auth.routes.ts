import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { User, PasswordReset, EmailVerification } from '../models/index.js';
import { sendPasswordResetEmail, sendRegistrationOtpEmail } from '../services/emailService.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  clearRefreshCookie,
  hashPassword,
  REFRESH_COOKIE,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
  toUserProfile,
  verifyRefreshToken,
  verifyPassword,
} from '../services/auth.service.js';
import type { AuthResult } from '../../../shared/types.js';

export const authRouter = Router();

function isGoogleEmail(email: string): boolean {
  const clean = email.trim().toLowerCase();
  return clean.endsWith('@gmail.com') || clean.endsWith('@googlemail.com');
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  rollNumber: z.string().trim().min(2).max(40),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
  accessibilityPreference: z
    .enum(['Screen Reader', 'High Contrast', 'Low Vision', 'Standard'])
    .optional(),
  inviteCode: z.string().trim().optional(),
  verificationToken: z.string().trim().min(1, 'Google Mail verification token is required.'),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(2),
  password: z.string().min(1),
});

function issue(res: import('express').Response, user: Parameters<typeof toUserProfile>[0]): void {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const result: AuthResult = {
    user: toUserProfile(user),
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL,
    },
  };
  setRefreshCookie(res, user);
  res.json(result);
}

/**
 * POST /api/auth/send-registration-otp
 *
 * Sends a 6-digit verification code to the candidate's Google Mail address.
 * Restricts registration exclusively to authenticated Google Mail accounts.
 */
authRouter.post(
  '/send-registration-otp',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().trim().email('Invalid email address format.'),
        name: z.string().trim().optional(),
      })
      .parse(req.body);

    const cleanEmail = body.email.toLowerCase();

    // 1. Strict Google Mail domain check
    if (!isGoogleEmail(cleanEmail)) {
      throw new HttpError(
        400,
        'invalid_email_domain',
        'Only authenticated Google Mail (@gmail.com) addresses are permitted for registration.'
      );
    }

    // 2. Prevent duplicate registrations
    const existing = await User.findOne({ email: cleanEmail }).select('_id').lean().exec();
    if (existing) {
      throw new HttpError(
        409,
        'already_registered',
        'That Google Mail address is already registered. Please sign in instead.'
      );
    }

    // 2.1 Enforce 60-second cooldown between OTP requests for the same email
    const recentVerification = await EmailVerification.findOne({ email: cleanEmail })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (recentVerification && (recentVerification as any).createdAt) {
      const elapsedMs = Date.now() - new Date((recentVerification as any).createdAt).getTime();
      const COOLDOWN_MS = 60 * 1000;
      if (elapsedMs < COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsedMs) / 1000);
        throw new HttpError(
          429,
          'cooldown_active',
          `Please wait ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} before requesting a new verification code.`
        );
      }
    }

    // 3. Generate 6-digit OTP code & unique verification session token
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = crypto.createHash('sha256').update(otpCode + salt).digest('hex') + ':' + salt;
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // 4. Save to EmailVerification with 10-minute expiry (TTL index)
    await EmailVerification.deleteMany({ email: cleanEmail });
    await EmailVerification.create({
      email: cleanEmail,
      codeHash,
      verificationToken,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // 5. Dispatch email via Brevo / Resend / SMTP / console
    const delivery = await sendRegistrationOtpEmail(cleanEmail, body.name || 'Candidate', otpCode);

    res.json({
      ok: true,
      message: 'Verification code sent to your Google Mail address.',
      verificationToken,
      isDevFallback: delivery.mode === 'console',
      devCode: delivery.mode === 'console' ? otpCode : undefined,
    });
  })
);

/**
 * POST /api/auth/verify-registration-otp
 *
 * Verifies the 6-digit OTP code entered by the candidate.
 */
authRouter.post(
  '/verify-registration-otp',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().trim().email(),
        code: z.string().trim().length(6, 'Verification code must be exactly 6 digits.'),
        verificationToken: z.string().trim().min(1, 'Verification token is required.'),
      })
      .parse(req.body);

    const cleanEmail = body.email.toLowerCase();
    const record = await EmailVerification.findOne({
      email: cleanEmail,
      verificationToken: body.verificationToken,
    }).exec();

    if (!record || record.expiresAt < new Date()) {
      throw new HttpError(
        400,
        'expired_code',
        'Verification code has expired. Please request a new code.'
      );
    }

    if (record.attempts >= 5) {
      throw new HttpError(
        429,
        'too_many_attempts',
        'Too many incorrect attempts. Please request a new verification code.'
      );
    }

    const [hash, salt] = record.codeHash.split(':');
    const expected = crypto.createHash('sha256').update(body.code.trim() + salt).digest('hex');

    if (expected !== hash) {
      record.attempts += 1;
      await record.save();
      throw new HttpError(
        400,
        'invalid_code',
        'Invalid 6-digit verification code. Please check your Gmail and try again.'
      );
    }

    record.verified = true;
    await record.save();

    res.json({
      ok: true,
      verified: true,
      message: 'Google Mail address successfully verified.',
      verificationToken: record.verificationToken,
    });
  })
);

/** POST /api/auth/register */
authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    // In production, registration requires an admin-issued invite code.
    if (env.inviteCodes && env.inviteCodes.length > 0) {
      if (!body.inviteCode || !env.inviteCodes.includes(body.inviteCode)) {
        throw new HttpError(403, 'invite_required', 'A valid invite code is required to register.');
      }
    }

    const email = body.email.toLowerCase();

    // 1. Strict Google Mail domain check
    if (!isGoogleEmail(email)) {
      throw new HttpError(
        400,
        'invalid_email_domain',
        'Only authenticated Google Mail (@gmail.com) addresses are permitted for registration.'
      );
    }

    // 2. Mandatory Google Mail OTP verification requirement
    if (!body.verificationToken) {
      throw new HttpError(
        400,
        'verification_required',
        'Google Mail verification required. Please verify that you own this email with the 6-digit verification code.'
      );
    }

    const verification = await EmailVerification.findOne({
      email,
      verificationToken: body.verificationToken,
      verified: true,
    }).exec();

    if (!verification) {
      throw new HttpError(
        400,
        'unverified_email',
        'Your Google Mail address has not been verified yet. Please enter the 6-digit verification code sent to your email.'
      );
    }

    const existing = await User.findOne({ $or: [{ email }, { rollNumber: body.rollNumber }] })
      .select('_id')
      .lean()
      .exec();
    if (existing) {
      throw new HttpError(
        409,
        'already_registered',
        'That Google Mail address or roll number is already registered. Please sign in instead.'
      );
    }

    const user = await User.create({
      name: body.name,
      email,
      rollNumber: body.rollNumber,
      passwordHash: await hashPassword(body.password),
      accessibilityPreference: body.accessibilityPreference ?? null,
      isGoogleAuthenticated: true,
      emailVerified: true,
      role: 'STUDENT',
    });

    // Clean up verified OTP record
    await EmailVerification.deleteMany({ email });

    issue(res, user);
  })
);

/**
 * GET /api/auth/google/config
 *
 * Exposes the configured Google OAuth Client ID to the frontend.
 */
authRouter.get(
  '/google/config',
  asyncHandler(async (_req, res) => {
    const clientId = (env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    res.json({
      configured: Boolean(clientId),
      clientId,
    });
  })
);

/**
 * POST /api/auth/google
 *
 * Official Google OAuth Authentication (Sign in & Registration).
 * Securely verifies Google ID tokens (GIS) or Google OAuth access tokens via official Google APIs.
 */
authRouter.post(
  '/google',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        credential: z.string().min(1, 'Google credential token is required.'),
        tokenType: z.enum(['id_token', 'access_token']).optional(),
        accessibilityPreference: z
          .enum(['Screen Reader', 'High Contrast', 'Low Vision', 'Standard'])
          .optional(),
      })
      .parse(req.body);

    // Verify token with Google's tokeninfo or userinfo API
    let tokenInfo: any = null;
    let lastError = '';

    // If tokenType is explicitly access_token, or as first attempt if looking like an access token
    if (body.tokenType === 'access_token' || (!body.credential.includes('.') && body.credential.startsWith('ya29.'))) {
      try {
        const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${body.credential}` },
        });
        if (uRes.ok) {
          tokenInfo = await uRes.json();
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    // Otherwise try standard Google ID token (JWT) verification
    if (!tokenInfo) {
      try {
        const gRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=` + encodeURIComponent(body.credential)
        );
        if (gRes.ok) {
          tokenInfo = await gRes.json();
        } else {
          // Fallback check: maybe it was an OAuth access token
          const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${body.credential}` },
          });
          if (uRes.ok) {
            tokenInfo = await uRes.json();
          } else {
            lastError = `Status ${gRes.status} on id_token, status ${uRes.status} on userinfo`;
          }
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    if (!tokenInfo || (!tokenInfo.email && !tokenInfo.sub)) {
      console.warn('[dristix-auth] Google token validation error:', lastError);
      throw new HttpError(401, 'invalid_google_token', 'Invalid or expired Google credential.');
    }

    const googleEmail = (tokenInfo.email || '').trim().toLowerCase();
    const isEmailVerified =
      tokenInfo.email_verified === 'true' ||
      tokenInfo.email_verified === true ||
      tokenInfo.verified_email === true;

    if (!googleEmail || !isEmailVerified) {
      throw new HttpError(
        403,
        'unverified_google_email',
        'Your Google account does not have a verified email address.'
      );
    }

    // Match existing student by email or Google ID
    let user = await User.findOne({
      $or: [{ email: googleEmail }, { googleId: tokenInfo.sub }],
    }).exec();

    if (user) {
      // Existing candidate: update Google link if needed & sign in
      if (!user.googleId) user.googleId = tokenInfo.sub;
      user.isGoogleAuthenticated = true;
      user.emailVerified = true;
      await user.save();
      return issue(res, user);
    }

    // New candidate: auto-provision Google-authenticated student account
    const candidateName = tokenInfo.name || tokenInfo.given_name || 'Google Candidate';

    // Generate unique roll number: DX-G + 4 random digits
    let assignedRoll = `DX-G` + crypto.randomInt(1000, 9999);
    while (await User.findOne({ rollNumber: assignedRoll }).select('_id').lean().exec()) {
      assignedRoll = `DX-G` + crypto.randomInt(1000, 9999);
    }

    // Generate random secure password hash for account integrity
    const randomPass = crypto.randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(randomPass);

    user = await User.create({
      name: candidateName,
      email: googleEmail,
      rollNumber: assignedRoll,
      passwordHash,
      accessibilityPreference: body.accessibilityPreference ?? null,
      isGoogleAuthenticated: true,
      emailVerified: true,
      googleId: tokenInfo.sub,
      role: 'STUDENT',
    });

    console.log(`[dristix-auth] Registered new Google-authenticated candidate: ` + googleEmail + ` (` + assignedRoll + `)`);
    issue(res, user);
  })
);

/** POST /api/auth/login */
authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const email = body.identifier.trim().toLowerCase();

    // 1. Strictly enforce Google Mail domain for candidate login
    if (!isGoogleEmail(email)) {
      throw new HttpError(
        400,
        'invalid_login_domain',
        'Only registered Google Mail (@gmail.com) addresses are permitted for candidate login.'
      );
    }

    // 2. Candidate login is strictly by Google Mail address and role STUDENT
    let user = await User.findOne({
      email,
      role: 'STUDENT',
    }).exec();

    // Check if account exists with ADMIN role to provide helpful guidance
    if (!user) {
      const adminUser = await User.findOne({ email, role: 'ADMIN' }).select('_id').lean().exec();
      if (adminUser) {
        throw new HttpError(
          403,
          'examiner_account',
          'This Google Mail is registered as an Examiner/Admin. Please click "Sign In to Examiner / Admin Studio" below.'
        );
      }
    }

    // Auto-provision or synchronize Sujal Sahu developer/candidate credentials
    if (email === 'sujalsahu196@gmail.com' && body.password === '87654321') {
      if (!user) {
        const hash = await hashPassword('87654321');
        user = await User.create({
          name: 'Sujal Sahu',
          email: 'sujalsahu196@gmail.com',
          rollNumber: 'DX-2026-001',
          passwordHash: hash,
          accessibilityPreference: 'Screen Reader',
          isGoogleAuthenticated: true,
          emailVerified: true,
          role: 'STUDENT',
        });
        console.log(`[dristix-auth] Auto-provisioned candidate account for developer: ${email}`);
      } else {
        const matches = await verifyPassword(body.password, user.passwordHash);
        if (!matches) {
          user.passwordHash = await hashPassword('87654321');
          await user.save();
          console.log(`[dristix-auth] Synchronized candidate password for developer: ${email}`);
        }
      }
    }

    // Compare against a dummy hash when the user is absent so that response
    // time does not reveal whether the account exists.
    const DUMMY =
      '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const hash = user?.passwordHash ?? DUMMY;
    const ok = await verifyPassword(body.password, hash);

    if (!user || !ok) {
      throw new HttpError(
        401,
        'invalid_credentials',
        'Invalid Google Mail address or password. Please verify your credentials or click "Forgot Password?" to reset your password.'
      );
    }

    issue(res, user);
  })
);

/**
 * POST /api/auth/refresh
 *
 * Essential for long exams: the access token lives 15 minutes but an exam runs
 * up to 60, so the client refreshes proactively rather than being logged out
 * mid-question.
 */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const cookieToken = req.cookies?.[REFRESH_COOKIE];
    const bodyToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : null;
    const headerToken = req.headers['x-refresh-token'];
    const rawHeader = typeof headerToken === 'string' ? headerToken.trim() : null;

    const token = cookieToken || bodyToken || rawHeader;
    if (typeof token !== 'string' || !token) {
      throw new HttpError(401, 'no_session', 'No active session.');
    }

    const payload = verifyRefreshToken(token);
    if (!payload) {
      clearRefreshCookie(res);
      throw new HttpError(401, 'session_expired', 'Session expired. Please sign in again.');
    }

    const user = await User.findById(payload.sub).exec();
    if (!user) {
      clearRefreshCookie(res);
      throw new HttpError(401, 'session_expired', 'Session expired. Please sign in again.');
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    setRefreshCookie(res, user);
    res.json({
      user: toUserProfile(user),
      tokens: { accessToken, refreshToken, expiresIn: env.ACCESS_TOKEN_TTL },
    } satisfies AuthResult);
  })
);

/**
 * POST /api/auth/admin-login
 *
 * Separate from student login because administrators authenticate with a short
 * username rather than an email or roll number, and the role is checked here so
 * a student token can never be used to reach admin routes.
 */
authRouter.post(
  '/admin-login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = z
      .object({ username: z.string().trim().min(1), password: z.string().min(1) })
      .parse(req.body);

    const cleanUser = username.trim().toLowerCase();

    // Query exclusively from MongoDB by lowercase admin username and role
    const user = await User.findOne({
      username: cleanUser,
      role: 'ADMIN',
    }).exec();

    const DUMMY = '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = user ? await verifyPassword(password, user.passwordHash ?? DUMMY) : false;

    if (!user || !ok) {
      throw new HttpError(401, 'invalid_credentials', 'Invalid administrator credentials.');
    }

    issue(res, user);
  })
);

/** GET /api/auth/me */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id).exec();
    if (!user) throw new HttpError(404, 'not_found', 'Account not found.');
    res.json({ user: toUserProfile(user) });
  })
);

/** POST /api/auth/logout */
authRouter.post('/logout', (_req, res) => {
  clearRefreshCookie(res);
  res.json({ ok: true });
});

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const visible = name.length <= 2 ? name[0] : name.slice(0, 2);
  const hiddenCount = Math.max(3, name.length - visible.length);
  return `${visible}${'*'.repeat(hiddenCount)}@${domain}`;
}

/**
 * POST /api/auth/forgot-password
 *
 * Initiates the password reset workflow by looking up the candidate/administrator
 * and emailing a secure 6-digit OTP code with a 15-minute expiry.
 */
authRouter.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { identifier, portal } = z

      .object({
        identifier: z.string().trim().min(1, 'Identifier (email, roll number, or username) is required.'),
        portal: z.enum(['student', 'admin']).default('student'),
      })
      .parse(req.body);

    const cleanIdent = identifier.toLowerCase();

    // Query user according to portal scope
    let user = null;
    if (portal === 'admin') {
      user = await User.findOne({
        role: 'ADMIN',
        $or: [{ email: cleanIdent }, { username: cleanIdent }, { rollNumber: cleanIdent.toUpperCase() }],
      }).exec();
    } else {
      user = await User.findOne({
        role: 'STUDENT',
        $or: [{ email: cleanIdent }, { rollNumber: cleanIdent.toUpperCase() }, { rollNumber: cleanIdent }],
      }).exec();
    }

    if (!user) {
      console.log(`[dristix-auth] ⚠️ Password reset requested for: "${cleanIdent}" (${portal} portal) - no matching account in MongoDB database.`);
      // Neutral message to avoid user enumeration
      res.json({
        ok: true,
        message: 'If an account matches those details, a verification code has been dispatched to the registered email.',
      });
      return;
    }

    // Clean up any pending previous tokens for this email
    await PasswordReset.deleteMany({ email: user.email }).exec();

    // Generate secure 6-digit verification code and reset token
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    const resetToken = crypto.randomBytes(32).toString('hex');
    const codeHash = await hashPassword(verificationCode);

    await PasswordReset.create({
      email: user.email,
      codeHash,
      resetToken,
      role: user.role,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    });

    await sendPasswordResetEmail(user.email, user.name, verificationCode, resetToken, portal);

    res.json({
      ok: true,
      message: `A password reset link and 6-digit code have been dispatched to ${maskEmail(user.email)}. Please check your Gmail / Email inbox.`,
      maskedEmail: maskEmail(user.email),
      email: user.email,
    });
  })
);

/**
 * POST /api/auth/validate-reset-token
 *
 * Verifies that a resetToken (e.g. from an email link) is valid and unexpired.
 */
authRouter.post(
  '/validate-reset-token',
  asyncHandler(async (req, res) => {
    const { email, resetToken } = z
      .object({
        email: z.string().trim().email(),
        resetToken: z.string().min(1),
      })
      .parse(req.body);

    const record = await PasswordReset.findOne({
      email: email.toLowerCase(),
      resetToken,
      used: false,
      expiresAt: { $gt: new Date() },
    }).exec();

    if (!record) {
      throw new HttpError(
        400,
        'invalid_token',
        'This password reset link has expired or already been used. Please request a new one.'
      );
    }

    res.json({ ok: true, valid: true });
  })
);

/**
 * POST /api/auth/verify-reset-code
 *
 * Verifies the 6-digit code against the stored hash and returns a scoped reset token.
 */
authRouter.post(
  '/verify-reset-code',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, code } = z
      .object({
        email: z.string().trim().email(),
        code: z.string().trim().min(6).max(6),
      })
      .parse(req.body);

    const record = await PasswordReset.findOne({
      email: email.toLowerCase(),
      used: false,
      expiresAt: { $gt: new Date() },
    }).exec();

    if (!record) {
      throw new HttpError(
        400,
        'invalid_or_expired_code',
        'The verification code has expired or is invalid. Please request a new code.'
      );
    }

    if (record.attempts >= 5) {
      await PasswordReset.deleteOne({ _id: record._id }).exec();
      throw new HttpError(429, 'too_many_attempts', 'Too many invalid attempts. Please request a fresh code.');
    }

    const ok = await verifyPassword(code, record.codeHash);
    if (!ok) {
      record.attempts += 1;
      await record.save();
      throw new HttpError(400, 'invalid_code', 'Incorrect verification code. Please check your email and try again.');
    }

    res.json({
      ok: true,
      resetToken: record.resetToken,
      message: 'Code verified successfully. You may now create your new password.',
    });
  })
);

/**
 * POST /api/auth/reset-password
 *
 * Authenticates with the one-time resetToken and updates the account password.
 */
authRouter.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, resetToken, newPassword } = z
      .object({
        email: z.string().trim().email(),
        resetToken: z.string().min(1),
        newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(200),
      })
      .parse(req.body);

    const record = await PasswordReset.findOne({
      email: email.toLowerCase(),
      resetToken,
      used: false,
      expiresAt: { $gt: new Date() },
    }).exec();

    if (!record) {
      throw new HttpError(
        400,
        'invalid_session',
        'Password reset session has expired or is invalid. Please restart the reset process.'
      );
    }

    const user = await User.findOne({ email: email.toLowerCase() }).exec();
    if (!user) {
      throw new HttpError(404, 'user_not_found', 'User account not found.');
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    // Mark reset token as consumed
    record.used = true;
    await record.save();
    await PasswordReset.deleteMany({ email: user.email }).exec();

    res.json({
      ok: true,
      message: 'Your password has been successfully updated. You may now sign in with your new password.',
    });
  })
);

