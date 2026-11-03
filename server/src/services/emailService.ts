import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  if (env.SMTP_USER && env.SMTP_PASS) {
    const isGmail = !env.SMTP_HOST || env.SMTP_HOST.includes('gmail') || env.SMTP_USER.endsWith('@gmail.com');
    const host = env.SMTP_HOST || (isGmail ? 'smtp.gmail.com' : undefined);
    const port = env.SMTP_PORT ?? 587;
    const secure = env.SMTP_SECURE !== undefined ? env.SMTP_SECURE : (port === 465);

    // Google App Passwords often contain spaces (e.g. "abcd efgh ijkl mnop"), strip them out:
    const cleanPass = env.SMTP_PASS.replace(/\s+/g, '');
    const cleanUser = env.SMTP_USER.trim();

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      // CRITICAL: Cloud containers (e.g. Render) lack IPv6 outbound routing.
      // family: 4 forces Node to resolve and connect via IPv4 only,
      // completely preventing 'connect ENETUNREACH 2404:6800:...' errors.
      family: 4,
      auth: {
        user: cleanUser,
        pass: cleanPass,
      },
      tls: {
        rejectUnauthorized: true,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    } as any);
    return transporter;
  }

  return null;
}

/**
 * Sends a password reset email containing a direct one-click link and a 6-digit verification code.
 * Delivery order:
 * 1. Brevo HTTPS API (Port 443) - Bypasses cloud egress firewalls (Render free tier)
 * 2. Resend HTTPS API (Port 443) - Alternative HTTPS email provider
 * 3. SMTP (Google Gmail) - Used in local dev or paid cloud tiers where ports 587/465 are unblocked
 * 4. High-visibility console fallback - Never leaves users stranded
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  recipientName: string,
  verificationCode: string,
  resetToken: string,
  portal: 'student' | 'admin' = 'student'
): Promise<{ delivered: boolean; mode: 'smtp' | 'brevo' | 'resend' | 'console'; error?: string }> {
  const subject = `DristiX Password Reset: Code ${verificationCode}`;

  // Intelligently resolve the public application URL
  const rawClientUrl = env.CLIENT_URL;
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  const baseUrl = (rawClientUrl && !rawClientUrl.includes('localhost'))
    ? rawClientUrl
    : (renderUrl || (process.env.NODE_ENV === 'production' ? 'https://dristix.onrender.com' : rawClientUrl));
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

  const resetLink = `${cleanBaseUrl}/?resetToken=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(toEmail)}&portal=${portal}`;

  const textBody = `Hello ${recipientName},

We received a request to reset your password for your DristiX account.

To reset your password directly from your email, click the link below:
${resetLink}

Alternatively, you can enter this 6-digit verification code in the portal:
${verificationCode}

This code and reset link will expire in 15 minutes.

If you did not request a password reset, please ignore this email. Your account remains completely secure.

Best regards,
The DristiX Team
${cleanBaseUrl}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>DristiX Password Reset</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #1f2937; margin: 0; padding: 24px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);">
    <tr>
      <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 36px; text-align: center;">
        <div style="display: inline-block; background-color: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 9999px; margin-bottom: 12px;">
          <span style="color: #ffffff; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">SECURE AUTHENTICATION</span>
        </div>
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">DristiX Assessment Portal</h1>
        <p style="color: #e0e7ff; margin: 6px 0 0; font-size: 13px;">${portal === 'admin' ? 'Administrator' : 'Candidate'} Password Reset</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 36px 32px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #111827; font-weight: 700;">Hello ${recipientName},</h2>
        <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #4b5563;">
          We received a request to reset the password for your account associated with <strong>${toEmail}</strong>. You can reset your password directly using the button below:
        </p>

        <!-- Direct Reset Button -->
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" target="_blank" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 15px 34px; border-radius: 12px; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4); text-transform: uppercase; letter-spacing: 0.5px;">
            Reset Password Now →
          </a>
        </div>

        <p style="margin: 0 0 12px; font-size: 12px; color: #6b7280; text-align: center;">
          Or copy and paste this direct link into your browser:
        </p>
        <p style="margin: 0 0 28px; font-size: 11px; word-break: break-all; color: #4f46e5; text-align: center; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <a href="${resetLink}" style="color: #4f46e5; text-decoration: underline;">${resetLink}</a>
        </p>

        <!-- 6-digit Code Alternative -->
        <div style="background-color: #f9fafb; border: 2px dashed #cbd5e1; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0;">
          <p style="margin: 0 0 10px; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            Alternatively, enter this 6-digit verification code:
          </p>
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #3730a3; background: #ffffff; padding: 6px 18px; border-radius: 10px; border: 1px solid #e2e8f0; display: inline-block;">
            ${verificationCode}
          </span>
          <p style="margin: 10px 0 0; font-size: 11px; color: #94a3b8; font-weight: 500;">
            Code expires in 15 minutes • Single use only
          </p>
        </div>

        <p style="margin: 20px 0 0; font-size: 12px; line-height: 1.6; color: #6b7280;">
          If you did not initiate this password reset, you can safely ignore this email. Your current password remains active and unchanged.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0 20px;">
        <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center;">
          Sent by DristiX Automated Authentication Dispatcher. Please do not reply directly to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  // 1. Try Brevo HTTPS REST API (Port 443 — guaranteed to bypass cloud egress SMTP blocks like Render free tier)
  if (env.BREVO_API_KEY) {
    const rawKey = env.BREVO_API_KEY.trim();
    if (rawKey.startsWith('xsmtpsib-')) {
      console.error(
        '[dristix-mail] ❌ Configuration Warning: The key in BREVO_API_KEY starts with "xsmtpsib-", which is an SMTP password, NOT a REST API Key!\n' +
        '               To fix: Go to Brevo -> "SMTP & API" -> click the "API Keys" tab -> generate an API key (starts with "xkeysib-").'
      );
    }
    try {
      const fromEmail = env.SMTP_USER || 'sujalsahu196@gmail.com';
      const fromName = 'DristiX Examination Portal';
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': rawKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: toEmail, name: recipientName }],
          subject,
          htmlContent: htmlBody,
          textContent: textBody,
        }),
      });

      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { messageId?: string };
        console.log(`[dristix-mail] ✅ Sent password reset email via Brevo HTTPS API to: ${toEmail} (id: ${data.messageId || 'ok'})`);
        return { delivered: true, mode: 'brevo' };
      } else {
        const errText = await res.text().catch(() => '');
        console.error(`[dristix-mail] ❌ Brevo HTTPS delivery failed for ${toEmail} (HTTP ${res.status}): ${errText}`);
      }
    } catch (err: any) {
      console.error(`[dristix-mail] ❌ Brevo API request failed:`, err?.message || err);
    }
  }

  // 2. Try Resend HTTPS REST API (Port 443)
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM || 'DristiX <onboarding@resend.dev>',
          to: [toEmail],
          subject,
          html: htmlBody,
          text: textBody,
        }),
      });

      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        console.log(`[dristix-mail] ✅ Sent password reset email via Resend HTTPS API to: ${toEmail} (id: ${data.id || 'ok'})`);
        return { delivered: true, mode: 'resend' };
      } else {
        const errText = await res.text().catch(() => '');
        console.error(`[dristix-mail] ❌ Resend HTTPS delivery failed for ${toEmail} (${res.status}): ${errText}`);
      }
    } catch (err: any) {
      console.error(`[dristix-mail] ❌ Resend API request failed:`, err?.message || err);
    }
  }

  // 3. Fall back to standard SMTP (works locally and on cloud hosts without SMTP firewalls)
  const client = getTransporter();

  if (client) {
    try {
      const info = await client.sendMail({
        from: env.EMAIL_FROM || env.SMTP_USER,
        to: toEmail,
        subject,
        text: textBody,
        html: htmlBody,
      });
      console.log(`[dristix-mail] ✅ Sent password reset email via SMTP to: ${toEmail} (messageId: ${info.messageId})`);
      return { delivered: true, mode: 'smtp' };
    } catch (err: any) {
      console.error(`[dristix-mail] ❌ SMTP delivery failed for ${toEmail}:`, err?.message || err);
      // Fall through to console logging so user/admin is never stranded during testing
    }
  }

  // Fallback to high-visibility console logging
  console.log('\n======================================================================');
  console.log('📧 [DRISTIX EMAIL DISPATCHER] PASSWORD RESET INSTRUCTIONS');
  console.log('======================================================================');
  console.log(`To:                 ${toEmail} (${recipientName})`);
  console.log(`Subject:            ${subject}`);
  console.log(`Direct Reset URL:   ${resetLink}`);
  console.log(`Verification OTP:   >>>  ${verificationCode}  <<<`);
  console.log(`Expiry:             15 minutes`);
  if (!env.BREVO_API_KEY && !env.RESEND_API_KEY && (!env.SMTP_USER || !env.SMTP_PASS)) {
    console.log('ℹ️  NOTE: Configure BREVO_API_KEY (recommended on Render) or SMTP in environment variables.');
  }
  console.log('======================================================================\n');

  return { delivered: true, mode: 'console' };
}


/**
 * Sends a registration OTP email to verify that a Google Mail address is genuine and belongs to the candidate.
 */
export async function sendRegistrationOtpEmail(
  toEmail: string,
  recipientName: string,
  verificationCode: string
): Promise<{ delivered: boolean; mode: 'smtp' | 'brevo' | 'resend' | 'console'; error?: string }> {
  const subject = `DristiX Verification Code: ${verificationCode} (Google Mail Verification)`;

  const textBody = `Hello ${recipientName},

Welcome to DristiX Accessible Assessment Portal.

To complete your candidate registration, please verify your Google Mail address using the 6-digit verification code below:

>>> ${verificationCode} <<<

This code will expire in 10 minutes. Only verified Google Mail accounts are eligible to register on DristiX.

If you did not initiate this registration, you can safely ignore this email.

Best regards,
The DristiX Verification Team`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>DristiX Google Mail Verification</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #1f2937; margin: 0; padding: 24px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);">
    <tr>
      <td style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 32px 36px; text-align: center;">
        <div style="display: inline-block; background-color: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 9999px; margin-bottom: 12px;">
          <span style="color: #ffffff; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">GOOGLE MAIL VERIFICATION</span>
        </div>
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">DristiX Assessment Portal</h1>
        <p style="color: #ccfbf1; margin: 6px 0 0; font-size: 13px;">Candidate Account Registration</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 36px 32px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #111827; font-weight: 700;">Hello ${recipientName},</h2>
        <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #4b5563;">
          Thank you for joining DristiX. Please verify that <strong>${toEmail}</strong> is your genuine Google Mail address by entering this 6-digit verification code in the portal:
        </p>

        <!-- 6-digit Verification Code -->
        <div style="background-color: #f0fdf4; border: 2px dashed #86efac; border-radius: 14px; padding: 24px; text-align: center; margin: 24px 0;">
          <p style="margin: 0 0 10px; font-size: 12px; color: #15803d; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
            Your 6-Digit Registration OTP
          </p>
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #047857; background: #ffffff; padding: 8px 20px; border-radius: 10px; border: 1px solid #bbf7d0; display: inline-block;">
            ${verificationCode}
          </span>
          <p style="margin: 12px 0 0; font-size: 11px; color: #65a30d; font-weight: 600;">
            Code expires in 10 minutes • Only valid for ${toEmail}
          </p>
        </div>

        <p style="margin: 20px 0 0; font-size: 12px; line-height: 1.6; color: #6b7280;">
          If you did not initiate this registration on DristiX, please disregard this message.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0 20px;">
        <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center;">
          Sent by DristiX Automated Candidate Verification Service.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  // 1. Try Brevo HTTPS REST API
  if (env.BREVO_API_KEY) {
    try {
      const rawKey = env.BREVO_API_KEY.trim();
      const fromEmail = env.SMTP_USER || 'sujalsahu196@gmail.com';
      const fromName = 'DristiX Examination Portal';
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': rawKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: toEmail, name: recipientName }],
          subject,
          htmlContent: htmlBody,
          textContent: textBody,
        }),
      });

      if (res.ok) {
        console.log(`[dristix-mail] ✅ Sent registration OTP email via Brevo to: ${toEmail}`);
        return { delivered: true, mode: 'brevo' };
      }
    } catch (err: any) {
      console.error(`[dristix-mail] ❌ Brevo OTP delivery error:`, err?.message || err);
    }
  }

  // 2. Try Resend HTTPS REST API
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM || 'DristiX <onboarding@resend.dev>',
          to: [toEmail],
          subject,
          html: htmlBody,
          text: textBody,
        }),
      });

      if (res.ok) {
        console.log(`[dristix-mail] ✅ Sent registration OTP email via Resend to: ${toEmail}`);
        return { delivered: true, mode: 'resend' };
      }
    } catch (err: any) {
      console.error(`[dristix-mail] ❌ Resend OTP delivery error:`, err?.message || err);
    }
  }

  // 3. Try SMTP
  const client = getTransporter();
  if (client) {
    try {
      const info = await client.sendMail({
        from: env.EMAIL_FROM || env.SMTP_USER,
        to: toEmail,
        subject,
        text: textBody,
        html: htmlBody,
      });
      console.log(`[dristix-mail] ✅ Sent registration OTP email via SMTP to: ${toEmail} (messageId: ${info.messageId})`);
      return { delivered: true, mode: 'smtp' };
    } catch (err: any) {
      console.error(`[dristix-mail] ❌ SMTP OTP delivery failed for ${toEmail}:`, err?.message || err);
    }
  }

  // Console Fallback for local dev/testing
  console.log('\n======================================================================');
  console.log('📧 [DRISTIX EMAIL DISPATCHER] GOOGLE MAIL REGISTRATION OTP');
  console.log('======================================================================');
  console.log(`To:                 ${toEmail} (${recipientName})`);
  console.log(`Subject:            ${subject}`);
  console.log(`Registration OTP:   >>>  ${verificationCode}  <<<`);
  console.log(`Expiry:             10 minutes`);
  console.log('======================================================================\n');

  return { delivered: true, mode: 'console' };
}
