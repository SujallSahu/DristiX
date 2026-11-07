import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import { ShieldCheck, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { ForgotPasswordModal } from '../auth/ForgotPasswordModal';

interface AdminLoginProps {
  onReturnToStudent: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onReturnToStudent }) => {
  const { loginAdmin } = useAuthStore();
  // Deliberately empty. These fields used to be prefilled with the real admin
  // credentials, which shipped the password inside the JavaScript bundle where
  // anyone could read it in DevTools. The server now decides.
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  useEffect(() => {
    useAnnouncerStore
      .getState()
      .announce(
        'DristiX Admin Studio login. Enter administrator username and password, or press Escape to return to Candidate Portal.',
        'assertive',
        true
      );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' && (username || password)) {
          return;
        }
        e.preventDefault();
        soundEffects.playNavigate();
        onReturnToStudent();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onReturnToStudent, username, password]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      const success = await loginAdmin(username, password);
      if (!success) {
        setErrorMessage('Invalid administrator credentials. Please check your username and password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Administrator Authentication"
      className="min-h-[85vh] flex flex-col justify-center items-center px-4 py-8 max-w-xl mx-auto"
    >
      <div className="w-full bg-theme-surface border-2 border-theme-border rounded-3xl p-6 sm:p-10 shadow-xl">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-theme-primary text-theme-primary-text font-black text-2xl shadow-md mb-3">
            <ShieldCheck className="w-8 h-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-theme-text tracking-tight">
            DristiX Admin Studio
          </h1>
          <p className="text-sm text-theme-text/80 mt-1">
            Restricted access for examiners, test authors, and administrators.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-500/10 border-2 border-red-500 text-red-500 text-sm font-semibold"
            >
              ⚠️ {errorMessage}
            </div>
          )}

          <div>
            <label
              htmlFor="admin-username"
              className="block text-sm font-bold text-theme-text mb-1.5"
            >
              Admin Username <span className="text-red-500">*</span>
            </label>
            <input
              id="admin-username"
              type="text"
              placeholder="e.g. DristiX-Admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/30 outline-none font-medium text-sm transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="admin-password"
                className="block text-sm font-bold text-theme-text"
              >
                Password <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setIsForgotPasswordOpen(true)}
                className="text-xs font-bold text-indigo-800 dark:text-indigo-200 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-1.5 py-0.5 transition"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter administrator password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 pr-12 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/30 outline-none font-medium text-sm transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 p-1 text-theme-text/60 hover:text-theme-text focus:ring-2 focus:ring-indigo-500 rounded"
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
            disabled={isSubmitting || !username.trim() || !password.trim()}
            className="w-full py-3.5 px-4 rounded-xl bg-theme-primary text-theme-primary-text hover:bg-theme-primary-hover font-extrabold text-base shadow-md transition focus:ring-4 focus:ring-theme-focus disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Authenticating…' : 'Authenticate & Enter Admin Studio'}
          </button>
        </form>

        {/* Back Link */}
        <div className="mt-6 pt-4 border-t border-theme-border text-center">
          <button
            type="button"
            onClick={onReturnToStudent}
            className="inline-flex items-center gap-2 text-sm font-bold text-theme-text/80 hover:text-theme-primary transition"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Return to Student Examination Portal</span>
          </button>
        </div>

        <ForgotPasswordModal
          isOpen={isForgotPasswordOpen}
          onClose={() => setIsForgotPasswordOpen(false)}
          portal="admin"
          initialIdentifier={username}
          onSuccessLogin={(id) => {
            if (id) setUsername(id);
            setPassword('');
          }}
        />
      </div>
    </div>
  );
};
