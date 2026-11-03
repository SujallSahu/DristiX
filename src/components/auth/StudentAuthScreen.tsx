import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import { LogIn, UserPlus, Eye, EyeOff, ShieldCheck } from 'lucide-react';
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
  const { loginStudent, registerStudent } = useAuthStore();
  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialMode);

  // Focus refs for keyboard navigation
  const signInTabRef = useRef<HTMLButtonElement>(null);
  const registerTabRef = useRef<HTMLButtonElement>(null);
  const loginIdInputRef = useRef<HTMLInputElement>(null);
  const regNameInputRef = useRef<HTMLInputElement>(null);

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
  // Non-null: the form always has a preference selected, even though the
  // stored profile allows null for accounts that never set one.
  const [regPref, setRegPref] = useState<AccessibilityPreference>('Screen Reader');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regError, setRegError] = useState('');

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
    if (regPassword.length < 8) {
      setRegError('Password must be at least 8 characters.');
      return;
    }
    setIsSubmitting(true);
    try {
      const ok = await registerStudent(regName, regEmail, regRoll, regPref, regPassword);
      if (!ok) {
        setRegError('Registration failed. That Email or Roll Number may already be registered.');
      } else {
        onAuthenticated?.();
      }
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
                Roll Number or Email <span className="text-red-500">*</span>
              </label>
              <input
                ref={loginIdInputRef}
                id="student-login-id"
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                onFocus={() => speakInput('Enter your email or roll number')}
                placeholder="Your registered roll number or email"
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
                  onClick={() => setShowPassword(!showPassword)}
                  onFocus={() => speakInput(showPassword ? 'Hide password button' : 'Show password button')}
                  className="absolute right-3 top-3 p-1 text-theme-text/60 hover:text-theme-text focus:ring-2 focus:ring-theme-focus rounded-lg transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password as plain text'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" aria-hidden="true" />
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
              className="w-full py-3.5 px-5 rounded-xl bg-theme-primary text-theme-primary-text font-black text-sm sm:text-base dx-glow-button hover:scale-[1.01] active:scale-[0.99] transition-all shadow-md focus:ring-4 focus:ring-theme-focus disabled:opacity-60 disabled:cursor-not-allowed"
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
                className="text-xs sm:text-sm font-bold text-theme-text/80 hover:text-theme-primary underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-theme-focus rounded-lg px-2 py-1 transition"
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
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border-2 border-indigo-500/30 hover:border-indigo-500/50 transition-all shadow-xs focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
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
                className="p-3 rounded-xl bg-red-500/10 border-2 border-red-500 text-red-500 text-sm font-semibold"
              >
                ⚠️ {regError}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="reg-email"
                  className="block text-xs sm:text-sm font-bold text-theme-text mb-1.5"
                >
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="reg-email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  onFocus={() => speakInput('Enter your email address')}
                  placeholder="rahul@example.com"
                  required
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text/50 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition"
                />
              </div>

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
                  placeholder="DX-104"
                  required
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text/50 focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-theme-text/60 hover:text-theme-text focus:ring-2 focus:ring-theme-focus rounded-lg transition-colors"
                    aria-label={showRegPassword ? 'Hide password' : 'Show password as plain text'}
                    title={showRegPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRegPassword ? (
                      <EyeOff className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      <Eye className="w-5 h-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              onFocus={() => speakInput('Registration complete karne ke liye Enter press karein')}
              className="w-full py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm sm:text-base shadow-md transition focus:ring-4 focus:ring-theme-focus disabled:opacity-60 disabled:cursor-not-allowed mt-1"
            >
              {isSubmitting ? 'Creating account…' : 'Complete Registration & Enter'}
            </button>

            <div className="text-center pt-1.5">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  soundEffects.playSelect();
                }}
                onFocus={() => speakInput('Already account hai to Sign In karne ke liye Enter press karein')}
                className="text-xs sm:text-sm font-bold text-theme-text/80 hover:text-theme-primary underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-theme-focus rounded-lg px-2 py-1 transition"
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
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border-2 border-indigo-500/30 hover:border-indigo-500/50 transition-all shadow-xs focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
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

