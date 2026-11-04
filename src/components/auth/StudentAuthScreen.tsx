import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import {
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  ShieldCheck,
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Clock,
} from 'lucide-react';
import type { AccessibilityPreference } from '../../../shared/types';
import { VoiceGuidedLoginCard } from './VoiceGuidedLoginCard';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface StudentAuthScreenProps {
  onAuthenticated?: () => void;
  /** Which tab to open on. `/register` deep-links the sign-up form. */
  initialMode?: 'login' | 'register';
  onNavigateToAdmin?: () => void;
}

export const StudentAuthScreen: React.FC<StudentAuthScreenProps> = ({
  onAuthenticated,
  initialMode = 'login',
  onNavigateToAdmin,
}) => {
  const {
    loginStudent,
    registerStudent,
    sendRegistrationOtp,
    verifyRegistrationOtp,
  } = useAuthStore();
  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialMode);

  // Focus refs for keyboard navigation
  const signInTabRef = useRef<HTMLButtonElement>(null);
  const registerTabRef = useRef<HTMLButtonElement>(null);
  const loginEmailInputRef = useRef<HTMLInputElement>(null);
  const regNameInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRoll, setRegRoll] = useState('');
  const [regPref, setRegPref] = useState<AccessibilityPreference>('Screen Reader');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regError, setRegError] = useState('');

  // Google OTP Verification State for Registration
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [verifiedEmailAddress, setVerifiedEmailAddress] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Auto-focus first input when mode changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (authMode === 'login') {
        loginEmailInputRef.current?.focus();
      } else {
        regNameInputRef.current?.focus();
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [authMode]);

  // Arrow key navigation between Sign In and Register tabs (WCAG Tablist pattern)
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentTab: 'login' | 'register') => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextTab = currentTab === 'login' ? 'register' : 'login';
      setAuthMode(nextTab);
      soundEffects.playSelect();
      useAnnouncerStore
        .getState()
        .announce(`Switched to ${nextTab === 'login' ? 'Sign In' : 'Register New Student'} tab`, 'assertive', true);
      setTimeout(() => {
        if (nextTab === 'login') {
          signInTabRef.current?.focus();
        } else {
          registerTabRef.current?.focus();
        }
      }, 50);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setAuthMode('login');
      signInTabRef.current?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setAuthMode('register');
      registerTabRef.current?.focus();
    }
  };

  // Vocalize input field prompt on focus for speech assistance
  const speakInput = (message: string) => {
    useAnnouncerStore.getState().announce(message, 'polite', true, false);
  };

  const isGmailDomain = (email: string) => {
    const clean = email.trim().toLowerCase();
    return clean.endsWith('@gmail.com') || clean.endsWith('@googlemail.com');
  };

  const handleEmailChange = (val: string) => {
    setRegEmail(val);
    // If candidate edits the email after verifying, reset verification state
    if (isEmailVerified && val.trim().toLowerCase() !== verifiedEmailAddress) {
      setIsEmailVerified(false);
      setVerificationToken('');
      setOtpSent(false);
      setOtpCode('');
      setOtpMessage('');
    }
  };

  // Send 6-digit registration OTP code to candidate's Gmail
  const handleSendOtp = async () => {
    if (resendCooldown > 0 || isSendingOtp) {
      return;
    }
    setRegError('');
    setOtpMessage('');
    const email = regEmail.trim().toLowerCase();

    if (!email) {
      setRegError('Please enter your Google Mail address.');
      return;
    }
    if (!isGmailDomain(email)) {
      setRegError('Registration requires an authenticated Google Mail (@gmail.com) address.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await sendRegistrationOtp(email, regName.trim());
      if (res.ok) {
        setOtpSent(true);
        setVerificationToken(res.verificationToken);
        setResendCooldown(60);
        if (res.devCode) {
          setDevCode(res.devCode);
        }
        setOtpMessage('Verification code sent to your Google Mail address.');
        soundEffects.playSelect();
        useAnnouncerStore
          .getState()
          .announce(`Verification code sent to ${email}. Please check your inbox.`, 'assertive', true);
        setTimeout(() => {
          otpInputRef.current?.focus();
        }, 150);
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to send verification code. Please check your email and try again.';
      setRegError(errorMsg);
      // If error indicates cooldown from server, synchronize frontend timer
      const cooldownMatch = errorMsg.match(/wait\s+(\d+)\s+second/i);
      if (cooldownMatch && cooldownMatch[1]) {
        const remaining = parseInt(cooldownMatch[1], 10);
        if (!isNaN(remaining) && remaining > 0) {
          setResendCooldown(remaining);
        }
      }
      soundEffects.playSelect();
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify 6-digit registration OTP entered by candidate
  const handleVerifyOtp = async () => {
    setRegError('');
    setOtpMessage('');
    const code = otpCode.trim();

    if (code.length !== 6) {
      setRegError('Please enter the complete 6-digit verification code.');
      return;
    }
    if (!verificationToken) {
      setRegError('Please request a verification code first.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const email = regEmail.trim().toLowerCase();
      const res = await verifyRegistrationOtp(email, code, verificationToken);
      if (res.verified) {
        setIsEmailVerified(true);
        setVerifiedEmailAddress(email);
        setVerificationToken(res.verificationToken);
        setOtpMessage('Google Mail successfully verified!');
        soundEffects.playSuccess();
        useAnnouncerStore
          .getState()
          .announce('Google Mail address verified successfully.', 'assertive', true);
      }
    } catch (err: any) {
      setRegError(err?.message || 'Invalid or expired verification code. Please check your Gmail and try again.');
      soundEffects.playSelect();
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Perform candidate sign-in strictly with Google Mail
  const performLogin = async (emailInput = loginEmail, pass = loginPassword): Promise<boolean> => {
    setLoginError('');
    const email = emailInput.trim().toLowerCase();

    if (!email) {
      setLoginError('Please enter your registered Google Mail address (@gmail.com).');
      return false;
    }

    // Strictly enforce Google Mail domain for candidate login
    if (!isGmailDomain(email)) {
      setLoginError('Only registered Google Mail addresses (@gmail.com) are permitted for login.');
      useAnnouncerStore
        .getState()
        .announce('Only registered Google Mail addresses ending in at gmail dot com are permitted for login.', 'assertive', true);
      return false;
    }

    setIsSubmitting(true);
    try {
      const ok = await loginStudent(email, pass);
      if (!ok) {
        setLoginError('Invalid Google Mail address or password. Please verify your credentials or click "Forgot Password?" to reset your password.');
        return false;
      } else {
        onAuthenticated?.();
        return true;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin();
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (!regName.trim() || !regEmail.trim() || !regRoll.trim() || !regPassword.trim()) {
      setRegError('Please fill in all registration fields.');
      return;
    }

    const email = regEmail.trim().toLowerCase();

    // 1. Strict Google Mail validation
    if (!isGmailDomain(email)) {
      setRegError('Registration is strictly restricted to authenticated Google Mail (@gmail.com) addresses.');
      useAnnouncerStore
        .getState()
        .announce('Registration is strictly restricted to authenticated Google Mail (@gmail.com) addresses.', 'assertive', true);
      return;
    }

    // 2. Mandatory Google Mail OTP verification requirement
    if (!isEmailVerified || !verificationToken) {
      setRegError('Please verify your Google Mail address with the 6-digit verification code sent to your Gmail inbox.');
      useAnnouncerStore
        .getState()
        .announce('Please verify your Google Mail address with the 6-digit verification code sent to your Gmail inbox.', 'assertive', true);
      if (!otpSent) {
        void handleSendOtp();
      } else {
        otpInputRef.current?.focus();
      }
      return;
    }

    if (regPassword.length < 8) {
      setRegError('Password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await registerStudent(
        regName.trim(),
        email,
        regRoll.trim(),
        regPref,
        regPassword,
        verificationToken || undefined
      );
      if (!ok) {
        setRegError('Registration failed. That Google Mail address or Roll Number may already be registered. Please sign in instead.');
      } else {
        onAuthenticated?.();
      }
    } catch (err: any) {
      setRegError(err?.message || 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoToAdmin = () => {
    soundEffects.playSelect();
    if (onNavigateToAdmin) {
      onNavigateToAdmin();
    } else {
      window.history.pushState({}, '', '/admin');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div
      role="region"
      aria-label="Student Portal Authentication"
      className="min-h-[82vh] flex flex-col justify-center items-center px-4 py-6 max-w-4xl mx-auto"
    >
      <div className="w-full max-w-xl dx-glass border-2 border-theme-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        {/* Header Branding */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-theme-primary text-theme-primary-text font-black text-xl shadow-lg mb-2 hover:scale-105 transition-transform">
            DX
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-theme-text tracking-tight">
            DristiX Candidate Portal
          </h1>
          <p className="text-xs sm:text-sm font-medium text-theme-text/80 mt-1 max-w-md mx-auto">
            Accessible online examination &amp; practice platform designed for everyone.
          </p>
        </div>

        {/* Tab Switcher: Login vs Register */}
        <div
          role="tablist"
          aria-label="Student authentication options"
          className="flex p-1.5 rounded-2xl bg-theme-bg/80 border-2 border-theme-border mb-6 shadow-xs"
        >
          <button
            ref={signInTabRef}
            id="tab-login"
            type="button"
            role="tab"
            aria-selected={authMode === 'login'}
            aria-controls="auth-panel-login"
            tabIndex={authMode === 'login' ? 0 : -1}
            onKeyDown={(e) => handleTabKeyDown(e, 'login')}
            onFocus={() => speakInput('Sign In tab. Registration ke liye Right Arrow press karein')}
            onClick={() => {
              setAuthMode('login');
              soundEffects.playSelect();
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all focus:ring-4 focus:ring-theme-focus cursor-pointer ${
              authMode === 'login'
                ? 'bg-theme-primary text-theme-primary-text shadow-md'
                : 'text-theme-text hover:bg-theme-surface/70'
            }`}
          >
            <LogIn className="w-4.5 h-4.5" aria-hidden="true" />
            <span>Sign In</span>
          </button>

          <button
            ref={registerTabRef}
            id="tab-register"
            type="button"
            role="tab"
            aria-selected={authMode === 'register'}
            aria-controls="auth-panel-register"
            tabIndex={authMode === 'register' ? 0 : -1}
            onKeyDown={(e) => handleTabKeyDown(e, 'register')}
            onFocus={() => speakInput('Register New Student tab. Sign In ke liye Left Arrow press karein')}
            onClick={() => {
              setAuthMode('register');
              soundEffects.playSelect();
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all focus:ring-4 focus:ring-theme-focus cursor-pointer ${
              authMode === 'register'
                ? 'bg-theme-primary text-theme-primary-text shadow-md'
                : 'text-theme-text hover:bg-theme-surface/70'
            }`}
          >
            <UserPlus className="w-4.5 h-4.5" aria-hidden="true" />
            <span>Register New Student</span>
          </button>
        </div>

        {/* LOGIN FORM */}
        {authMode === 'login' && (
          <form
            id="auth-panel-login"
            role="tabpanel"
            aria-labelledby="tab-login"
            onSubmit={handleLoginSubmit}
            className="space-y-4"
          >
            {/* Interactive Guided Voice Flow */}
            <VoiceGuidedLoginCard
              loginIdentifier={loginEmail}
              setLoginIdentifier={setLoginEmail}
              loginPassword={loginPassword}
              setLoginPassword={setLoginPassword}
              onLogin={performLogin}
              isSubmitting={isSubmitting}
              errorMessage={loginError}
            />

            {loginError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-500/10 border-2 border-red-500 text-red-500 text-sm font-bold flex items-start gap-2"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="student-login-email"
                  className="block text-xs sm:text-sm font-extrabold text-theme-text"
                >
                  Google Mail Address <span className="text-red-500">*</span>
                </label>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Must be @gmail.com
                </span>
              </div>
              <input
                ref={loginEmailInputRef}
                id="student-login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                onFocus={() => speakInput('Enter your registered Google Mail address ending in at gmail dot com')}
                placeholder="e.g. rahul@gmail.com"
                required
                className={`w-full px-4 py-3 rounded-xl bg-theme-surface border-2 text-theme-text placeholder:text-theme-text/50 focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition-all shadow-xs ${
                  loginEmail.trim() && !isGmailDomain(loginEmail)
                    ? 'border-amber-500 focus:border-amber-500'
                    : 'border-theme-border focus:border-theme-primary'
                }`}
              />
              {loginEmail.trim() && !isGmailDomain(loginEmail) && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Only registered Google Mail addresses (@gmail.com) are permitted for candidate login.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="student-login-pass"
                  className="block text-xs sm:text-sm font-extrabold text-theme-text"
                >
                  Password <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotPasswordOpen(true)}
                  onFocus={() => speakInput('Forgot password button. Press Enter to reset your password.')}
                  className="text-xs font-bold text-theme-primary hover:underline focus:outline-none focus:ring-2 focus:ring-theme-focus rounded px-1.5 py-0.5 transition cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="student-login-pass"
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onFocus={() => speakInput('Enter your password')}
                  placeholder="Enter your candidate password"
                  required
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text/50 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowPassword(!showPassword);
                    soundEffects.playSelect();
                  }}
                  onFocus={() => speakInput(showPassword ? 'Hide password button' : 'Show password button')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-theme-text/60 hover:text-theme-text focus:ring-2 focus:ring-theme-focus rounded-lg transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password as plain text'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-theme-primary" aria-hidden="true" />
                  ) : (
                    <Eye className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              onFocus={() => speakInput('Sign in ke liye Enter press karein')}
              className="w-full py-3.5 px-5 rounded-xl bg-theme-primary text-theme-primary-text font-black text-sm sm:text-base dx-glow-button hover:scale-[1.01] active:scale-[0.99] transition-all shadow-md focus:ring-4 focus:ring-theme-focus disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? 'Signing in…' : 'Sign In to Candidate Dashboard'}
            </button>

            <div className="text-center pt-1.5">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  soundEffects.playSelect();
                }}
                onFocus={() => speakInput('Naya student registration ke liye Enter press karein')}
                className="text-xs sm:text-sm font-bold text-theme-text/80 hover:text-theme-primary underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-theme-focus rounded-lg px-2 py-1 transition cursor-pointer"
              >
                Don't have an account? Register New Student
              </button>
            </div>

            {/* Examiner / Administrator Portal Switcher */}
            <div className="pt-3.5 mt-3.5 border-t-2 border-theme-border/60 text-center">
              <button
                type="button"
                onClick={handleGoToAdmin}
                onFocus={() => speakInput('Examiner and Admin Studio sign in ke liye Enter press karein')}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border-2 border-indigo-500/30 hover:border-indigo-500/50 transition-all shadow-xs focus:outline-none focus:ring-4 focus:ring-indigo-500/50 cursor-pointer"
              >
                <ShieldCheck className="w-4.5 h-4.5" aria-hidden="true" />
                <span>Sign In to Examiner / Admin Studio &rarr;</span>
              </button>
            </div>
          </form>
        )}

        {/* REGISTRATION FORM */}
        {authMode === 'register' && (
          <form
            id="auth-panel-register"
            role="tabpanel"
            aria-labelledby="tab-register"
            onSubmit={handleRegisterSubmit}
            className="space-y-3.5"
          >
            {regError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-500/10 border-2 border-red-500 text-red-500 text-sm font-semibold flex items-start gap-2"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{regError}</span>
              </div>
            )}

            <div>
              <label htmlFor="reg-name" className="block text-xs sm:text-sm font-bold text-theme-text mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={regNameInputRef}
                id="reg-name"
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                onFocus={() => speakInput('Enter your full name')}
                placeholder="e.g. Rahul Sharma"
                required
                className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text/50 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition"
              />
            </div>

            {/* Google Mail Input & OTP Verification Section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="reg-email"
                  className="block text-xs sm:text-sm font-bold text-theme-text"
                >
                  Google Mail Address <span className="text-red-500">*</span>
                </label>
                {isEmailVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Verified Google Account
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Must be @gmail.com
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  id="reg-email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onFocus={() => speakInput('Enter your Google Mail address ending in at gmail dot com')}
                  placeholder="e.g. rahul@gmail.com"
                  required
                  disabled={isEmailVerified}
                  className={`w-full px-3.5 py-2.5 sm:py-3 pr-28 rounded-xl bg-theme-surface border-2 text-theme-text placeholder:text-theme-text/50 focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition ${
                    isEmailVerified
                      ? 'border-emerald-500 bg-emerald-500/5'
                      : regEmail && !isGmailDomain(regEmail)
                      ? 'border-amber-500 focus:border-amber-500'
                      : 'border-theme-border focus:border-theme-primary'
                  }`}
                />

                {!isEmailVerified && (
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isSendingOtp || resendCooldown > 0 || !regEmail.trim() || !isGmailDomain(regEmail)}
                      onFocus={() =>
                        speakInput(
                          resendCooldown > 0
                            ? `Resend available in ${resendCooldown} seconds`
                            : otpSent
                            ? 'Resend verification code button'
                            : 'Send verification code to your Google Mail button'
                        )
                      }
                      title={resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : undefined}
                      className="px-2.5 py-1.5 rounded-lg bg-theme-primary text-theme-primary-text font-bold text-xs shadow-xs hover:opacity-90 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                    >
                      {isSendingOtp ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Sending…</span>
                        </>
                      ) : resendCooldown > 0 ? (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>Resend ({resendCooldown}s)</span>
                        </>
                      ) : (
                        <>
                          <Mail className="w-3 h-3" />
                          <span>{otpSent ? 'Resend' : 'Verify'}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Warning if non-Google email is entered */}
              {regEmail.trim() && !isGmailDomain(regEmail) && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Only authenticated Google Mail addresses (@gmail.com) are permitted.
                </p>
              )}

              {/* OTP Input Card when OTP has been sent */}
              {otpSent && !isEmailVerified && (
                <div className="mt-2.5 p-3.5 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 space-y-2.5 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4" />
                      Enter 6-digit code sent to {regEmail}
                    </span>
                    {resendCooldown > 0 ? (
                      <span className="text-[11px] text-theme-text/70 font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Resend in {resendCooldown}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={isSendingOtp || resendCooldown > 0}
                        className="text-[11px] font-bold text-theme-primary hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={otpInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      onFocus={() => speakInput('Enter 6 digit verification code from your Gmail')}
                      placeholder="123456"
                      className="w-36 px-3 py-2 text-center text-lg font-black tracking-widest rounded-lg bg-theme-surface border-2 border-theme-border focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      disabled={isVerifyingOtp || otpCode.length !== 6}
                      className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isVerifyingOtp ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Verifying…</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Verify Code</span>
                        </>
                      )}
                    </button>
                  </div>

                  {otpMessage && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                      ℹ️ {otpMessage}
                    </p>
                  )}

                  {devCode && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono font-bold bg-emerald-500/20 p-1.5 rounded">
                      💡 Dev verification code: <strong>{devCode}</strong>
                    </p>
                  )}
                </div>
              )}

              {/* Success confirmation */}
              {isEmailVerified && (
                <div className="mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Google Mail authenticated successfully!
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEmailVerified(false);
                      setVerificationToken('');
                      setOtpSent(false);
                      setOtpCode('');
                    }}
                    className="text-[11px] text-theme-text/70 hover:underline cursor-pointer"
                  >
                    Change Email
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="reg-roll"
                  className="block text-xs sm:text-sm font-bold text-theme-text mb-1.5"
                >
                  Roll Number / Candidate ID <span className="text-red-500">*</span>
                </label>
                <input
                  id="reg-roll"
                  type="text"
                  value={regRoll}
                  onChange={(e) => setRegRoll(e.target.value)}
                  onFocus={() => speakInput('Enter your roll number or candidate ID')}
                  placeholder="e.g. DX-104"
                  required
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text/50 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-pref"
                  className="block text-xs sm:text-sm font-bold text-theme-text mb-1.5"
                >
                  Assistive Preference
                </label>
                <select
                  id="reg-pref"
                  value={regPref}
                  onChange={(e) =>
                    setRegPref(e.target.value as AccessibilityPreference)
                  }
                  onFocus={() => speakInput('Select your assistive preference')}
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition"
                >
                  <option value="Screen Reader">Screen Reader / Voice Output</option>
                  <option value="Low Vision">Low Vision / Large Print</option>
                  <option value="High Contrast">High Contrast (Yellow/Dark)</option>
                  <option value="Standard">Standard Keyboard Navigation</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="reg-pass"
                className="block text-xs sm:text-sm font-bold text-theme-text mb-1.5"
              >
                Create Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="reg-pass"
                  type={showRegPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  onFocus={() => speakInput('Create your password, minimum eight characters')}
                  placeholder="At least 8 characters"
                  required
                  className="w-full px-3.5 py-2.5 sm:py-3 pr-11 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text/50 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowRegPassword(!showRegPassword);
                    soundEffects.playSelect();
                  }}
                  onFocus={() => speakInput(showRegPassword ? 'Hide password button' : 'Show password button')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-theme-text/60 hover:text-theme-text focus:ring-2 focus:ring-theme-focus rounded-lg transition-colors cursor-pointer"
                  aria-label={showRegPassword ? 'Hide password' : 'Show password as plain text'}
                  title={showRegPassword ? 'Hide password' : 'Show password'}
                >
                  {showRegPassword ? (
                    <EyeOff className="w-5 h-5 text-theme-primary" aria-hidden="true" />
                  ) : (
                    <Eye className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              onFocus={() => speakInput('Registration complete karne ke liye Enter press karein')}
              className="w-full py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm sm:text-base shadow-md transition focus:ring-4 focus:ring-theme-focus disabled:opacity-60 disabled:cursor-not-allowed mt-2 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating Account…</span>
                </>
              ) : (
                <span>Complete Registration &amp; Enter</span>
              )}
            </button>

            <div className="text-center pt-1.5">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  soundEffects.playSelect();
                }}
                onFocus={() => speakInput('Already account hai to Sign In karne ke liye Enter press karein')}
                className="text-xs sm:text-sm font-bold text-theme-text/80 hover:text-theme-primary underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-theme-focus rounded-lg px-2 py-1 transition cursor-pointer"
              >
                Already have an account? Sign In
              </button>
            </div>

            {/* Examiner / Administrator Portal Switcher */}
            <div className="pt-3.5 mt-3.5 border-t-2 border-theme-border/60 text-center">
              <button
                type="button"
                onClick={handleGoToAdmin}
                onFocus={() => speakInput('Examiner and Admin Studio sign in ke liye Enter press karein')}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border-2 border-indigo-500/30 hover:border-indigo-500/50 transition-all shadow-xs focus:outline-none focus:ring-4 focus:ring-indigo-500/50 cursor-pointer"
              >
                <ShieldCheck className="w-4.5 h-4.5" aria-hidden="true" />
                <span>Sign In to Examiner / Admin Studio &rarr;</span>
              </button>
            </div>
          </form>
        )}

        <ForgotPasswordModal
          isOpen={isForgotPasswordOpen}
          onClose={() => setIsForgotPasswordOpen(false)}
          portal="student"
          initialIdentifier={loginEmail}
          onSuccessLogin={(id) => {
            if (id) setLoginEmail(id);
            setLoginPassword('');
          }}
        />
      </div>
    </div>
  );
};
