import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import {
  Mail,
  KeyRound,
  Lock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  portal: 'student' | 'admin';
  initialIdentifier?: string;
  initialResetToken?: string;
  initialEmail?: string;
  onSuccessLogin?: (identifier: string) => void;
}

type Step = 'REQUEST_CODE' | 'VERIFY_CODE' | 'RESET_PASSWORD' | 'SUCCESS';

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  portal,
  initialIdentifier = '',
  initialResetToken = '',
  initialEmail = '',
  onSuccessLogin,
}) => {
  const { requestPasswordReset, verifyResetCode, resetPassword } = useAuthStore();
  const { announce } = useAnnouncerStore();

  const [step, setStep] = useState<Step>('REQUEST_CODE');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');

  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const identifierInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialResetToken && initialEmail) {
        // Direct entry via email reset link!
        setStep('RESET_PASSWORD');
        setResolvedEmail(initialEmail);
        setResetToken(initialResetToken);
        setIdentifier(initialEmail);
        setMaskedEmail(initialEmail);
        setTimeout(() => passwordInputRef.current?.focus(), 150);
        announce('Password reset session loaded from your email. Please create your new password.', 'assertive');
      } else {
        setStep('REQUEST_CODE');
        setIdentifier(initialIdentifier);
        setCode('');
        setResetToken('');
        setMaskedEmail('');
        setResolvedEmail('');
        setTimeout(() => identifierInputRef.current?.focus(), 150);
        announce(
          `Forgot Password dialog opened for ${portal === 'admin' ? 'Administrator' : 'Student'}. Enter your registered email to continue.`,
          'polite'
        );
      }
      setNewPassword('');
      setConfirmPassword('');
      setErrorMessage('');
      setStatusMessage('');
      setResendCooldown(0);
      soundEffects.playSelect();
    }
  }, [isOpen, initialIdentifier, initialResetToken, initialEmail, portal, announce]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  // Step 1: Request Code & Email Link
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setErrorMessage('Please enter your email, roll number, or username.');
      return;
    }
    setErrorMessage('');
    setStatusMessage('');
    setIsLoading(true);

    try {
      const res = await requestPasswordReset(identifier.trim(), portal);
      if (res.ok || res.success) {
        const targetEmail = res.email || res.maskedEmail || '';
        setResolvedEmail(targetEmail);
        setMaskedEmail(res.maskedEmail || targetEmail);
        setStep('VERIFY_CODE');
        setResendCooldown(60);
        soundEffects.playSuccess();
        announce(`Password reset instructions dispatched to ${targetEmail}. Please check your Gmail or email inbox.`, 'assertive');
        setTimeout(() => codeInputRef.current?.focus(), 150);
      } else {
        setErrorMessage(res.message || 'Could not send verification email.');
        soundEffects.playSelect();
        announce(res.message || 'Error sending verification email.', 'assertive');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Server error sending verification email.';
      setErrorMessage(msg);
      soundEffects.playSelect();
    } finally {
      setIsLoading(false);
    }
  };

  // Resend code action
  const handleResendCode = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setErrorMessage('');
    setStatusMessage('');
    setIsLoading(true);

    try {
      const res = await requestPasswordReset(identifier.trim(), portal);
      if (res.ok || res.success) {
        setResendCooldown(60);
        setStatusMessage('A fresh password reset email has been dispatched to your inbox.');
        soundEffects.playSuccess();
        announce('A fresh password reset email has been dispatched to your inbox.', 'polite');
      } else {
        setErrorMessage(res.message || 'Could not resend email.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error resending email.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code from your email.');
      return;
    }

    setErrorMessage('');
    setStatusMessage('');
    setIsLoading(true);

    try {
      const res = await verifyResetCode(resolvedEmail || identifier.trim(), cleanCode);
      if ((res.ok || res.success) && res.resetToken) {
        setResetToken(res.resetToken);
        setStep('RESET_PASSWORD');
        soundEffects.playSuccess();
        announce('Verification code accepted. Please enter your new password.', 'assertive');
        setTimeout(() => passwordInputRef.current?.focus(), 150);
      } else {
        setErrorMessage(res.message || 'Invalid or expired verification code.');
        soundEffects.playSelect();
        announce(res.message || 'Invalid verification code.', 'assertive');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error validating code.';
      setErrorMessage(msg);
      soundEffects.playSelect();
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return;
    }

    setErrorMessage('');
    setStatusMessage('');
    setIsLoading(true);

    try {
      const res = await resetPassword(resolvedEmail || identifier.trim(), resetToken, newPassword);
      if (res.ok || res.success) {
        setStep('SUCCESS');
        soundEffects.playSuccess();
        announce('Password reset successfully! You can now log into your account.', 'assertive');
      } else {
        setErrorMessage(res.message || 'Failed to update password.');
        soundEffects.playSelect();
        announce(res.message || 'Failed to update password.', 'assertive');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error setting new password.';
      setErrorMessage(msg);
      soundEffects.playSelect();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const isPortalAdmin = portal === 'admin';
  const primaryButtonClass = isPortalAdmin
    ? 'bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold focus:ring-indigo-500/50'
    : 'bg-theme-primary text-theme-primary-text font-black focus:ring-theme-focus';

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-password-title"
        className="relative w-full max-w-lg bg-theme-surface border-2 border-theme-border rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden transition-all text-theme-text"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          aria-label="Close forgot password dialog"
          className="absolute top-5 right-5 p-2 rounded-xl text-theme-text/60 hover:text-theme-text hover:bg-theme-bg focus:ring-2 focus:ring-theme-focus transition-all"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Header Badge & Title */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${
              isPortalAdmin ? 'bg-indigo-600 text-white' : 'bg-theme-primary text-theme-primary-text'
            }`}
          >
            {step === 'SUCCESS' ? (
              <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
            ) : isPortalAdmin ? (
              <ShieldCheck className="w-7 h-7" aria-hidden="true" />
            ) : (
              <KeyRound className="w-7 h-7" aria-hidden="true" />
            )}
          </div>
          <div>
            <h2 id="forgot-password-title" className="text-xl sm:text-2xl font-black tracking-tight">
              {step === 'SUCCESS'
                ? 'Password Reset Complete'
                : step === 'RESET_PASSWORD'
                ? 'Create New Password'
                : step === 'VERIFY_CODE'
                ? 'Check Your Email'
                : 'Reset Your Password'}
            </h2>
            <p className="text-xs sm:text-sm text-theme-text/75 font-medium">
              {isPortalAdmin ? 'DristiX Administrator Access' : 'DristiX Candidate Portal'}
            </p>
          </div>
        </div>

        {/* Step Progress Indicators */}
        {step !== 'SUCCESS' && (
          <div
            role="progressbar"
            aria-label="Password reset step progress"
            aria-valuenow={step === 'REQUEST_CODE' ? 33 : step === 'VERIFY_CODE' ? 66 : 100}
            aria-valuemin={0}
            aria-valuemax={100}
            className="flex items-center gap-2 mb-6"
          >
            <div
              className={`h-1.5 flex-1 rounded-full transition-all ${
                step === 'REQUEST_CODE' || step === 'VERIFY_CODE' || step === 'RESET_PASSWORD'
                  ? isPortalAdmin
                    ? 'bg-indigo-600'
                    : 'bg-theme-primary'
                  : 'bg-theme-border'
              }`}
            />
            <div
              className={`h-1.5 flex-1 rounded-full transition-all ${
                step === 'VERIFY_CODE' || step === 'RESET_PASSWORD'
                  ? isPortalAdmin
                    ? 'bg-indigo-600'
                    : 'bg-theme-primary'
                  : 'bg-theme-border'
              }`}
            />
            <div
              className={`h-1.5 flex-1 rounded-full transition-all ${
                step === 'RESET_PASSWORD'
                  ? isPortalAdmin
                    ? 'bg-indigo-600'
                    : 'bg-theme-primary'
                  : 'bg-theme-border'
              }`}
            />
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 p-3.5 rounded-xl bg-red-500/10 border-2 border-red-500/80 text-red-700 dark:text-red-400 text-xs sm:text-sm font-bold flex items-start gap-2.5 animate-shake"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            role="status"
            className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/80 text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm font-bold flex items-start gap-2.5"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* ================= STEP 1: REQUEST VERIFICATION CODE ================= */}
        {step === 'REQUEST_CODE' && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <p className="text-xs sm:text-sm text-theme-text/80 leading-relaxed">
              Enter your registered {isPortalAdmin ? 'administrator username or email' : 'roll number or email address'}. We will send a secure password reset link and verification code directly to your email inbox.
            </p>

            <div>
              <label
                htmlFor="reset-identifier-input"
                className="block text-xs sm:text-sm font-extrabold mb-1.5"
              >
                {isPortalAdmin ? 'Admin Username or Registered Email' : 'Roll Number or Registered Email'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  ref={identifierInputRef}
                  id="reset-identifier-input"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={isPortalAdmin ? 'e.g., admin or admin@gmail.com' : 'e.g., DX-101 or student@gmail.com'}
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 pl-11 rounded-xl bg-theme-bg/60 border-2 border-theme-border text-theme-text placeholder:text-theme-text/45 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition-all"
                />
                <Mail className="w-5 h-5 absolute left-3.5 top-3.5 text-theme-text/50 pointer-events-none" aria-hidden="true" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !identifier.trim()}
              className={`w-full py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base shadow-md transition-all focus:ring-4 disabled:opacity-60 disabled:cursor-not-allowed ${primaryButtonClass}`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" aria-hidden="true" />
                  <span>Sending Email…</span>
                </>
              ) : (
                <>
                  <span>Send Reset Email</span>
                  <ArrowRight className="w-4.5 h-4.5" aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ================= STEP 2: ENTER VERIFICATION CODE ================= */}
        {step === 'VERIFY_CODE' && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            {/* Email Dispatch Notice */}
            <div className="p-4 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/25 flex items-start gap-3">
              <Mail className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-xs sm:text-sm">
                <div className="text-theme-text/80 font-medium">Check your Gmail / Email Inbox:</div>
                <div className="font-mono font-bold text-theme-text text-sm break-all">{maskedEmail}</div>
                <p className="text-theme-text/75 text-xs mt-1.5 leading-relaxed">
                  We sent an email with a <strong>direct one-click reset link</strong> and a <strong>6-digit verification code</strong> (valid for 15 minutes).
                </p>
              </div>
            </div>

            {/* Quick Gmail Web Shortcut Link */}
            {maskedEmail.includes('gmail.com') && (
              <a
                href="https://mail.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl border border-theme-border bg-theme-bg/60 hover:bg-theme-bg text-theme-text text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <span>Open Google Gmail</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            )}

            <div>
              <label
                htmlFor="reset-code-input"
                className="block text-xs sm:text-sm font-extrabold mb-1.5"
              >
                Enter 6-Digit Code From Email <span className="text-red-500">*</span>
              </label>
              <input
                ref={codeInputRef}
                id="reset-code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-xl bg-theme-bg/60 border-2 border-theme-border text-center font-mono font-black text-2xl tracking-[0.4em] placeholder:text-theme-text/25 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none transition-all"
              />
              <p className="text-xs text-theme-text/60 mt-1">
                Tip: You can also click the "Reset Password Now" button inside your email to skip entering this code.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || code.trim().length !== 6}
              className={`w-full py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base shadow-md transition-all focus:ring-4 disabled:opacity-60 disabled:cursor-not-allowed ${primaryButtonClass}`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" aria-hidden="true" />
                  <span>Verifying Code…</span>
                </>
              ) : (
                <>
                  <span>Verify Code &amp; Continue</span>
                  <ArrowRight className="w-4.5 h-4.5" aria-hidden="true" />
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setStep('REQUEST_CODE');
                  setErrorMessage('');
                }}
                disabled={isLoading}
                className="text-theme-text/75 hover:text-theme-text font-bold inline-flex items-center gap-1 focus:ring-2 focus:ring-theme-focus rounded p-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Change Email / ID</span>
              </button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading || resendCooldown > 0}
                className="text-theme-primary hover:underline font-bold inline-flex items-center gap-1.5 focus:ring-2 focus:ring-theme-focus rounded p-1 disabled:opacity-50 disabled:no-underline"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>
                  {resendCooldown > 0 ? `Resend email in ${resendCooldown}s` : 'Resend email'}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* ================= STEP 3: RESET PASSWORD ================= */}
        {step === 'RESET_PASSWORD' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Identity verified for {resolvedEmail || identifier}. Set a new password below.</span>
            </div>

            <div>
              <label
                htmlFor="reset-new-password"
                className="block text-xs sm:text-sm font-extrabold mb-1.5"
              >
                New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  id="reset-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 pl-11 pr-12 rounded-xl bg-theme-bg/60 border-2 border-theme-border text-theme-text placeholder:text-theme-text/45 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition-all"
                />
                <Lock className="w-5 h-5 absolute left-3.5 top-3.5 text-theme-text/50 pointer-events-none" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3.5 top-3.5 text-theme-text/60 hover:text-theme-text focus:ring-2 focus:ring-theme-focus rounded"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="reset-confirm-password"
                className="block text-xs sm:text-sm font-extrabold mb-1.5"
              >
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  minLength={8}
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 pl-11 pr-12 rounded-xl bg-theme-bg/60 border-2 border-theme-border text-theme-text placeholder:text-theme-text/45 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition-all"
                />
                <Lock className="w-5 h-5 absolute left-3.5 top-3.5 text-theme-text/50 pointer-events-none" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-3.5 text-theme-text/60 hover:text-theme-text focus:ring-2 focus:ring-theme-focus rounded"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {/* Checklist */}
            <div className="text-xs space-y-1.5 text-theme-text/75 p-3 rounded-xl bg-theme-bg/50 border border-theme-border/60">
              <div className={`flex items-center gap-2 ${newPassword.length >= 8 ? 'text-emerald-700 dark:text-emerald-400 font-bold' : ''}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-green-500' : 'bg-theme-text/40'}`} />
                <span>At least 8 characters long</span>
              </div>
              <div className={`flex items-center gap-2 ${newPassword && confirmPassword && newPassword === confirmPassword ? 'text-emerald-700 dark:text-emerald-400 font-bold' : ''}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${newPassword && confirmPassword && newPassword === confirmPassword ? 'bg-green-500' : 'bg-theme-text/40'}`} />
                <span>Passwords match</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || newPassword.length < 8 || newPassword !== confirmPassword}
              className={`w-full py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base shadow-md transition-all focus:ring-4 disabled:opacity-60 disabled:cursor-not-allowed ${primaryButtonClass}`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" aria-hidden="true" />
                  <span>Updating Password…</span>
                </>
              ) : (
                <>
                  <span>Save New Password</span>
                  <CheckCircle2 className="w-4.5 h-4.5" aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ================= STEP 4: SUCCESS CONFIRMATION ================= */}
        {step === 'SUCCESS' && (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-theme-text">Your password has been changed!</h3>
              <p className="text-xs sm:text-sm text-theme-text/80 max-w-sm mx-auto">
                All existing reset sessions have been securely closed. You can now log into your account using your new password.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSuccessLogin && (resolvedEmail || identifier)) {
                  onSuccessLogin(identifier);
                }
              }}
              className={`w-full py-3.5 px-5 rounded-xl text-sm sm:text-base shadow-md transition-all focus:ring-4 ${primaryButtonClass}`}
            >
              Proceed to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
