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
    loginWithGoogle,
    sendRegistrationOtp,
    verifyRegistrationOtp,
  } = useAuthStore();
  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialMode);

  // Focus refs for keyboard navigation
  const signInTabRef = useRef<HTMLButtonElement>(null);
  const registerTabRef = useRef<HTMLButtonElement>(null);
  const loginIdInputRef = useRef<HTMLInputElement>(null);
  const regNameInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
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

  // Google OTP Verification State
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

  // 1-Click Google OAuth Loading State
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Dynamically load Google Identity Services (GIS) client script if not already present
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existingScript = document.getElementById('google-gsi-client');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

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
        loginIdInputRef.current?.focus();
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
    // If the candidate edits the email after verifying, reset verification state
    if (isEmailVerified && val.trim().toLowerCase() !== verifiedEmailAddress) {
      setIsEmailVerified(false);
      setVerificationToken('');
      setOtpSent(false);
      setOtpCode('');
      setOtpMessage('');
    }
  };

  // 1-Click Google OAuth button click handler
  const handleGoogleSignIn = async () => {
    setLoginError('');
    setRegError('');

    const googleClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

    if (typeof window !== 'undefined' && (window as any).google?.accounts?.id && googleClientId) {
      setIsGoogleLoading(true);
      try {
        (window as any).google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: any) => {
            if (response?.credential) {
              const ok = await loginWithGoogle(response.credential, regPref);
              if (ok) {
                onAuthenticated?.();
              } else {
                setLoginError('Google sign in could not be completed.');
              }
            }
            setIsGoogleLoading(false);
          },
        });
        (window as any).google.accounts.id.prompt();
        return;
      } catch (err: any) {
        console.warn('Google Identity Services prompt warning:', err);
        setIsGoogleLoading(false);
      }
    }

    // Accessible Google Mail prompt fallback if GIS is loading or client ID is pending configuration
    const enteredEmail = window.prompt('Enter your Google Mail address (@gmail.com) to continue with Google:');
    if (!enteredEmail || !enteredEmail.trim()) return;
    const cleanEmail = enteredEmail.trim().toLowerCase();
    if (!isGmailDomain(cleanEmail)) {
      window.alert('Only authenticated Google Mail (@gmail.com) accounts are supported.');
      return;
    }

    if (authMode === 'login') {
      setLoginIdentifier(cleanEmail);
      loginIdInputRef.current?.focus();
      speakInput('Google Mail entered. Enter your password to sign in.');
    } else {
      setRegEmail(cleanEmail);
      setAuthMode('register');
      setTimeout(() => {
        void handleSendOtp();
      }, 150);
    }
  };

  // Send 6-digit registration OTP code to candidate's Gmail
  const handleSendOtp = async () => {
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
      setRegError(err?.message || 'Failed to send verification code. Please check your email and try again.');
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

  const performLogin = async (identifier = loginIdentifier, pass = loginPassword): Promise<boolean> => {
    setLoginError('');
    if (!identifier.trim()) {
      setLoginError('Please enter your Roll Number or Email.');
      return false;
    }
    setIsSubmitting(true);
    try {
      const ok = await loginStudent(identifier.trim(), pass);
      if (!ok) {
        setLoginError('Invalid student credentials. Please check your email, roll number and password.');
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

    // 2. Strict OTP verification requirement
    if (!isEmailVerified || !verificationToken) {
      setRegError('Please verify your Google Mail address with the 6-digit verification code before completing registration.');
      useAnnouncerStore
        .getState()
        .announce('Please verify your Google Mail address with the 6-digit verification code before completing registration.', 'assertive', true);
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
        verificationToken
      );
      if (!ok) {
        setRegError('Registration failed. That Google Mail or Roll Number may already be registered.');
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
          className="flex p-1.5 rounded-2xl bg-theme-bg/80 border-2 border-theme-border mb-5 shadow-xs"
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
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all focus:ring-4 focus:ring-theme-focus ${
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
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all focus:ring-4 focus:ring-theme-focus ${
              authMode === 'register'
                ? 'bg-theme-primary text-theme-primary-text shadow-md'
                : 'text-theme-text hover:bg-theme-surface/70'
            }`}
          >
            <UserPlus className="w-4.5 h-4.5" aria-hidden="true" />
            <span>Register New Student</span>
          </button>
        </div>

        {/* 1-Click Google OAuth Button (Available on both Sign In & Register) */}
        <div className="mb-4">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || isSubmitting}
            onFocus={() => speakInput('Continue with Google button. Press Enter to sign in or register with your Google account.')}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border-2 border-theme-border bg-theme-surface hover:bg-theme-bg text-theme-text font-bold text-sm shadow-xs transition-all focus:ring-4 focus:ring-theme-focus hover:shadow-md group active:scale-[0.99] disabled:opacity-60 cursor-pointer"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isGoogleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
          </button>

          <div className="relative flex py-2 items-center my-1">
            <div className="flex-grow border-t border-theme-border/60"></div>
            <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider font-extrabold text-theme-text/60">
              Or continue with {authMode === 'login' ? 'credentials' : 'Google Mail verification'}
            </span>
            <div className="flex-grow border-t border-theme-border/60"></div>
          </div>
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
            {/* Interactive Guided Voice Flow (तरीका 1) */}
            <VoiceGuidedLoginCard
              loginIdentifier={loginIdentifier}
              setLoginIdentifier={setLoginIdentifier}
              loginPassword={loginPassword}
              setLoginPassword={setLoginPassword}
              onLogin={performLogin}
              isSubmitting={isSubmitting}
              errorMessage={loginError}
            />

            {loginError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-500/10 border-2 border-red-500 text-red-500 text-sm font-bold"
              >
                ⚠️ {loginError}
              </div>
            )}

            <div>
              <label
                htmlFor="student-login-id"
                className="block text-xs sm:text-sm font-extrabold text-theme-text mb-1.5"
              >
                Roll Number or Google Mail <span className="text-red-500">*</span>
              </label>
              <input
                ref={loginIdInputRef}
                id="student-login-id"
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                onFocus={() => speakInput('Enter your Google email or roll number')}
                placeholder="e.g. rahul@gmail.com or DX-104"
                required
                className="w-full px-4 py-3 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text/50 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition-all shadow-xs"
              />
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
                  className="text-xs font-bold text-theme-primary hover:underline focus:outline-none focus:ring-2 focus:ring-theme-focus rounded px-1.5 py-0.5 transition"
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
                      disabled={isSendingOtp || !regEmail.trim() || !isGmailDomain(regEmail)}
                      onFocus={() => speakInput('Send verification code to your Google Mail button')}
                      className="px-2.5 py-1.5 rounded-lg bg-theme-primary text-theme-primary-text font-bold text-xs shadow-xs hover:opacity-90 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                    >
                      {isSendingOtp ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Sending…</span>
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
                      <span className="text-[11px] text-theme-text/70 font-semibold">
                        Resend in {resendCooldown}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={isSendingOtp}
                        className="text-[11px] font-bold text-theme-primary hover:underline cursor-pointer"
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
          initialIdentifier={loginIdentifier}
          onSuccessLogin={(id) => {
            if (id) setLoginIdentifier(id);
            setLoginPassword('');
          }}
        />
      </div>
    </div>
  );
};
