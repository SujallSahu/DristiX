import React, { useEffect, useRef, useState } from 'react';
import { usePreferencesStore } from './store/usePreferencesStore';
import { useExamStore } from './store/useExamStore';
import { useAnnouncerStore } from './store/useAnnouncerStore';
import { useAuthStore } from './store/useAuthStore';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { createTimerWorker } from './workers/timerWorker';
import { soundEffects } from './utils/soundEffects';

import { SkipLinks } from './components/layout/SkipLinks';
import { LiveAnnouncer } from './components/a11y/LiveAnnouncer';
import { Header } from './components/layout/Header';
import { ExamCatalogScreen } from './components/catalog/ExamCatalogScreen';
import { ExamScreen } from './components/exam/ExamScreen';
import { ExamSidebar } from './components/exam/ExamSidebar';
import { DiagnosticReport } from './components/exam/DiagnosticReport';
import { QuestionPalette } from './components/exam/QuestionPalette';
import { A11ySettingsModal } from './components/a11y/A11ySettingsModal';
import { ShortcutsHelpModal } from './components/a11y/ShortcutsHelpModal';
import { SubmitConfirmModal } from './components/exam/SubmitConfirmModal';
import { ExamFeedbackModal } from './components/exam/ExamFeedbackModal';
import { TestUnavailableModal } from './components/common/TestUnavailableModal';
import { A11yInspector } from './components/a11y/A11yInspector';
import { StudentAuthScreen } from './components/auth/StudentAuthScreen';
import { ForgotPasswordModal } from './components/auth/ForgotPasswordModal';
import { LandingPage } from './components/landing/LandingPage';
import { AdminLogin } from './components/admin/AdminLogin';
import { AdminPanel } from './components/admin/AdminPanel';
import { StudentAnalyticsView } from './components/analytics/StudentAnalyticsView';
import { VoiceAssistantOrb } from './components/voice/VoiceAssistantOrb';
import { useBootstrapStore } from './stores/useBootstrapStore';
import { getDataSource } from './services/dataSource';
import { formatDuration } from './utils/formatDuration';
import { dispatchAccessibilityEvent } from './accessibility';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { ShieldCheck, RotateCcw } from 'lucide-react';
import type { TextScale } from './store/usePreferencesStore';

const ZoomResetFloatingPill: React.FC = () => {
  const fontSize = usePreferencesStore((s) => s.fontSize);
  const setFontSize = usePreferencesStore((s) => s.setFontSize);

  if (fontSize <= 100) return null;

  return (
    <div
      role="region"
      aria-label="Text magnification reset control"
      className="fixed bottom-16 right-3 sm:bottom-4 sm:right-4 z-[9990] flex items-center gap-1.5 shadow-2xl rounded-2xl p-1.5 backdrop-blur-md animate-in slide-in-from-bottom-2"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-surface-elevated) 95%, var(--bg-page))',
        border: '2px solid var(--primary)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.36), 0 0 16px var(--primary-glow, rgba(0,0,0,0.2))',
      }}
    >
      <button
        type="button"
        onClick={() => {
          setFontSize(100);
          soundEffects.playSelect();
          useAnnouncerStore.getState().announce('Text size returned to normal: 100 percent.', 'assertive', true);
        }}
        className="px-3.5 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95"
        style={{
          background: 'var(--primary-gradient, var(--primary))',
          color: 'var(--primary-text)',
        }}
        title="Reset text size to 100% (Shortcut: Press 0 or Ctrl+0)"
        aria-label={`Reset text size from ${fontSize}% to 100% normal. Shortcut: Press 0.`}
      >
        <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Reset Zoom ({fontSize}%)</span>
      </button>

      <button
        type="button"
        onClick={() => {
          const fontSizes: TextScale[] = [100, 125, 150, 175, 200];
          const idx = fontSizes.indexOf(fontSize);
          if (idx > 0) {
            const prev = fontSizes[idx - 1];
            setFontSize(prev);
            soundEffects.playSelect();
            useAnnouncerStore.getState().announce(`Text size decreased to ${prev} percent.`, 'polite', true);
          }
        }}
        className="w-8 h-8 rounded-xl grid place-items-center font-black text-base border border-theme-border bg-theme-surface text-theme-text hover:border-theme-primary transition-transform active:scale-95 cursor-pointer"
        title="Decrease text size (Shortcut: Press -)"
        aria-label="Decrease text size. Shortcut: Press minus."
      >
        −
      </button>
    </div>
  );
};

export const App: React.FC = () => {
  useNetworkStatus();
  const { applyToDOM } = usePreferencesStore();
  const {
    activeView,
    currentExam,
    isSubmitted,
    setTimer,
    submitExam,
    returnToCatalog,
    attemptId,
  } = useExamStore();
  const { currentStudent, isAdminAuthenticated } = useAuthStore();
  const bootstrapStatus = useBootstrapStore((s) => s.status);
  const bootstrapError = useBootstrapStore((s) => s.error);
  const [currentRoute, setCurrentRoute] = useState<string>(() => window.location.pathname);
  const workerRef = useRef<Worker | null>(null);

  // Check for email reset link parameters: ?resetToken=...&email=...
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState<string | null>(null);
  const [resetEmailFromUrl, setResetEmailFromUrl] = useState<string | null>(null);
  const [resetPortalFromUrl, setResetPortalFromUrl] = useState<'student' | 'admin'>('student');
  const [isUrlResetModalOpen, setIsUrlResetModalOpen] = useState(false);

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const token = searchParams.get('resetToken');
      const email = searchParams.get('email');
      const portal = searchParams.get('portal');
      if (token && email) {
        setResetTokenFromUrl(token);
        setResetEmailFromUrl(email);
        setResetPortalFromUrl(portal === 'admin' ? 'admin' : 'student');
        setIsUrlResetModalOpen(true);
        // Clear search parameters from URL so refreshes don't re-trigger
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch {
      // ignore URL parsing error
    }
  }, []);

  // Helper to change URL and trigger re-render
  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentRoute(path);
  };

  // Listen to browser Back / Forward buttons and internal popstate dispatches with exam protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const store = useExamStore.getState();
      if (store.activeView === 'exam' && !store.isSubmitted) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const handlePopState = () => {
      const store = useExamStore.getState();
      // Prevent browser back button from leaving an active unsubmitted exam
      if (store.activeView === 'exam' && !store.isSubmitted) {
        window.history.pushState(null, '', window.location.pathname);
        store.setSubmitModalOpen(true);
        soundEffects.playTimerAlert();
        useAnnouncerStore
          .getState()
          .announce(
            'You cannot go back before submitting the exam. Submit confirmation window opened. Please submit your test first.',
            'assertive',
            true
          );
        return;
      }
      setCurrentRoute(window.location.pathname);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Initialize global keyboard shortcuts listener
  useGlobalShortcuts();

  // App startup lifecycle. In local mode this resolves immediately; with the
  // API it covers the network round trip and renders an announced loading state.
  useEffect(() => {
    // One-time cleanup of state written by pre-backend builds. A stale
    // `dristix_current_student` used to make the app render as signed in while
    // the server had no session, so every request 401'd behind a convincing
    // looking portal. It is no longer read, but removing it stops old copies
    // from confusing anyone inspecting storage.
    try {
      for (const key of [
        'dristix_current_student',
        'dristix_students',
        'dristix_submissions',
        'dristix_exams',
        'dristix_practice_drills',
        'dristix_attempts_local',
      ]) {
        localStorage.removeItem(key);
      }
    } catch {
      // Private browsing can block storage; harmless.
    }

    void useBootstrapStore.getState().run();
  }, []);

  // The catalog lives in MongoDB behind authentication, so it is read once the
  // session is known — never at mount.
  //
  // Calling it unconditionally at mount raced the refresh round-trip: the
  // access token did not exist yet, the request came back 401, and that became
  // a sticky `catalogError` which no amount of navigating away cleared. The
  // catalog therefore stayed empty after signing in and only a full page
  // reload fixed it. Keying on the session covers both the restored-session
  // path and a fresh login, and re-reads on sign-out/sign-in.
  // Whenever a student signs in or their session is restored across a page reload/refresh,
  // guarantee the student portal opens directly on the first page (Mock Examinations catalog dashboard).
  useEffect(() => {
    if (!currentStudent) return;
    useExamStore.getState().resetToPortalFirstPage();
    if (window.location.pathname.startsWith('/login') || window.location.pathname.startsWith('/register')) {
      navigateTo('/');
    }
  }, [currentStudent?.id]);

  // Apply saved theme and text scaling to DOM on mount
  useEffect(() => {
    applyToDOM();
  }, [applyToDOM]);

  // Synchronize catalog and submissions on real-time cross-tab events
  useEffect(() => {
    const handleCatalogRefresh = () => {
      if (useAuthStore.getState().currentStudent) {
        void useExamStore.getState().loadCatalog();
      }
    };

    const handleSubmissionsRefresh = () => {
      void useAuthStore.getState().syncSubmissions();
    };

    window.addEventListener('dristix:catalog-updated', handleCatalogRefresh);
    window.addEventListener('dristix:notification-broadcast', handleCatalogRefresh);
    window.addEventListener('dristix:submission-updated', handleSubmissionsRefresh);
    window.addEventListener('dristix:submission-deleted', handleSubmissionsRefresh);
    window.addEventListener('dristix:submission-cleared', handleSubmissionsRefresh);

    return () => {
      window.removeEventListener('dristix:catalog-updated', handleCatalogRefresh);
      window.removeEventListener('dristix:notification-broadcast', handleCatalogRefresh);
      window.removeEventListener('dristix:submission-updated', handleSubmissionsRefresh);
      window.removeEventListener('dristix:submission-deleted', handleSubmissionsRefresh);
      window.removeEventListener('dristix:submission-cleared', handleSubmissionsRefresh);
    };
  }, []);

  // Off-Thread Timer Web Worker Management
  useEffect(() => {
    let worker: Worker | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const startFallback = () => {
      if (fallbackInterval) return;
      fallbackInterval = setInterval(() => {
        const state = useExamStore.getState();
        if (state.activeView === 'exam' && state.timeRemaining > 0 && !state.isSubmitted) {
          const nextSec = Math.max(0, state.timeRemaining - 1);
          const h = Math.floor(nextSec / 3600).toString().padStart(2, '0');
          const m = Math.floor((nextSec % 3600) / 60).toString().padStart(2, '0');
          const s = (nextSec % 60).toString().padStart(2, '0');
          state.setTimer(nextSec, `${h}:${m}:${s}`);

          if (nextSec === 0) {
            dispatchAccessibilityEvent(
              'TIMER_CRITICAL',
              {
                remainingSeconds: 0,
                formattedTime: '00:00:00',
                message: 'Exam time has expired! Automatically submitting your responses now.',
              },
              'CRITICAL'
            );
            void submitExam();
          }
        }
      }, 1000);
    };

    try {
      worker = createTimerWorker();
      workerRef.current = worker;

      worker.onerror = (err) => {
        console.warn('[DristiX] Timer worker error, starting in-memory fallback timer:', err);
        startFallback();
      };

      worker.onmessage = (e) => {
        const { type, remainingSeconds, formattedTime, milestone } = e.data;

        if (type === 'TICK') {
          const store = useExamStore.getState();
          if (store.isSubmitted || store.activeView !== 'exam') return;
          setTimer(remainingSeconds, formattedTime);

          // Milestone announcements (30m, 15m, 10m, 5m, 2m, 1m warnings)
          if (milestone && milestone.alert) {
            const isCritical = remainingSeconds <= 120;
            dispatchAccessibilityEvent(
              isCritical ? 'TIMER_CRITICAL' : 'TIMER_WARNING',
              {
                remainingSeconds,
                formattedTime,
                message: milestone.message,
              },
              isCritical ? 'CRITICAL' : 'HIGH'
            );
          }
        } else if (type === 'TIMEOUT') {
          const store = useExamStore.getState();
          if (store.isSubmitted || store.activeView !== 'exam') return;
          dispatchAccessibilityEvent(
            'TIMER_CRITICAL',
            {
              remainingSeconds: 0,
              formattedTime: '00:00:00',
              message: 'Exam time has expired! Automatically submitting your responses now.',
            },
            'CRITICAL'
          );
          void submitExam();
        }
      };
    } catch (err) {
      console.warn('[DristiX] Timer worker unavailable, using fallback interval:', err);
      startFallback();
    }

    return () => {
      if (worker) {
        worker.terminate();
        workerRef.current = null;
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [setTimer, submitExam]);

  // Synchronize timer worker with activeView, currentExam, currentRoute, and submission state
  useEffect(() => {
    if (!workerRef.current) return;

    if (
      currentRoute.startsWith('/admin') ||
      activeView === 'catalog' ||
      isSubmitted ||
      !currentStudent
    ) {
      workerRef.current.postMessage({ action: 'PAUSE' });
    } else if (activeView === 'exam' && !isSubmitted) {
      // Seed worker with duration and authoritative deadline when exam is active
      const state = useExamStore.getState();
      const examSeconds = state.timeRemaining > 0 ? state.timeRemaining : (currentExam.durationMinutes || 60) * 60;
      workerRef.current.postMessage({
        action: 'START',
        payload: {
          seconds: examSeconds,
          expiresAtMs: state.expiresAtMs,
        },
      });
    }
  }, [
    currentRoute,
    activeView,
    currentExam.id,
    currentExam.durationMinutes,
    attemptId,
    isSubmitted,
    currentStudent,
  ]);

  // Server clock re-sync while an exam is running.
  //
  // The worker keeps the display ticking smoothly, but it counts down on the
  // local clock, which drifts and can be changed by the student. Every minute
  // we ask the server how much time is genuinely left and correct the worker.
  // If the server says the deadline has passed, we submit immediately rather
  // than waiting for a local countdown that may never reach zero.
  useEffect(() => {
    if (activeView !== 'exam' || isSubmitted || !attemptId) return;

    const tick = async () => {
      const attempt = useExamStore.getState().attemptId;
      if (!attempt) return;
      try {
        const { heartbeat } = await getDataSource().exams;
        const clock = await heartbeat(attempt);

        const store = useExamStore.getState();
        if (store.isSubmitted) return;

        if (clock.remainingSeconds <= 0) {
          soundEffects.playTimerAlert();
          useAnnouncerStore
            .getState()
            .announce('Time has expired. Your examination is being submitted now.', 'assertive', true);
          void store.submitExam();
          return;
        }

        store.setTimer(clock.remainingSeconds, formatDuration(clock.remainingSeconds));

        // Nudge the worker to the authoritative value smoothly without pausing
        const worker = workerRef.current;
        if (worker) {
          worker.postMessage({
            action: 'SYNC',
            payload: {
              seconds: clock.remainingSeconds,
              expiresAtMs: new Date(clock.expiresAt).getTime(),
            },
          });
        }
      } catch {
        // A dropped heartbeat is not fatal. The next one is 60s later, and the
        // server re-checks the real deadline on submit regardless.
      }
    };

    const id = setInterval(() => void tick(), 60_000);
    return () => clearInterval(id);
  }, [activeView, isSubmitted, attemptId]);

  // Pick up newly published exams without a manual refresh.
  //
  // An admin publishing an exam is a rare, out-of-band event, so polling would
  // be wasteful. Re-reading the catalog when the tab regains focus costs one
  // request and means a student who switches away and back sees new tests.
  const lastCatalogFocusRefreshRef = useRef<number>(0);
  useEffect(() => {
    if (activeView !== 'catalog' || !currentStudent) return;

    const onFocus = () => {
      // Do not trigger background network re-fetch if user was interacting with accessibility settings
      const store = useExamStore.getState();
      if (store.isSettingsOpen || store.isShortcutsOpen) return;

      const now = Date.now();
      if (now - lastCatalogFocusRefreshRef.current < 20000) return; // Throttle to at most once per 20s
      if (document.visibilityState === 'visible' && useAuthStore.getState().currentStudent) {
        lastCatalogFocusRefreshRef.current = now;
        void useExamStore.getState().loadCatalog();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [activeView, currentStudent]);

  // Flush in-progress answers when the tab is hidden or closed.
  //
  // The debounced autosave can be up to 1.2s behind, so a student who answers a
  // question and immediately closes the tab would otherwise lose it.
  useEffect(() => {
    const flush = () => {
      const store = useExamStore.getState();
      if (store.activeView !== 'exam' || store.isSubmitted || !store.attemptId) return;
      store.persistState();
    };

    // `pagehide` fires for tab close and navigation; `visibilitychange` covers
    // mobile backgrounding, where pagehide may not run.
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  // Initial welcome announcement for assistive technologies
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.location.pathname.startsWith('/admin')) {
        useAnnouncerStore
          .getState()
          .announce('Welcome to DristiX Administrator Studio.', 'polite', false);
      } else {
        useAnnouncerStore
          .getState()
          .announce(
            'Welcome to DristiX Accessible Online Examination Platform.',
            'polite',
            false
          );
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // 0. STARTUP GATE
  // Reachable only when the data source is the API. Local mode resolves this in
  // the same tick, so the current offline behaviour is unchanged.
  if (bootstrapStatus === 'loading' || bootstrapStatus === 'idle') {
    return (
      <div
        className="min-h-screen bg-theme-bg text-theme-text flex items-center justify-center p-6 font-sans"
      >
        <div role="status" aria-live="polite" className="text-center space-y-4 max-w-xl">
          <div
            aria-hidden="true"
            className="w-12 h-12 mx-auto rounded-full border-4 border-theme-border border-t-theme-primary animate-spin"
          />
          <p className="text-lg font-bold">Loading DristiX</p>
          <p className="text-xs sm:text-sm text-theme-text-secondary whitespace-nowrap">
            Preparing your accessible examination portal. This will only take a moment.
          </p>
        </div>
      </div>
    );
  }

  if (bootstrapStatus === 'error') {
    return (
      <div className="min-h-screen bg-theme-bg text-theme-text p-6 flex items-center justify-center font-sans">
        <div
          role="alert"
          aria-live="assertive"
          className="max-w-lg space-y-4 border-2 border-theme-danger rounded-xl p-6 bg-theme-surface"
        >
          <h1 className="text-xl font-black text-theme-danger">
            Could not reach the DristiX server
          </h1>
          <p className="text-base">{bootstrapError}</p>
          <p className="text-sm text-theme-text-secondary">
            Please ensure the DristiX backend server is running (<code>npm run dev:api</code> or <code>npm run dev:all</code>) and MongoDB is reachable.
          </p>
          <button
            type="button"
            onClick={() => void useBootstrapStore.getState().run()}
            className="px-4 py-2 font-bold rounded-lg border-2 border-theme-border bg-theme-primary text-theme-primary-text focus:outline-none focus:ring-4 focus:ring-theme-focus-ring"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const emailResetModal = (
    <ForgotPasswordModal
      isOpen={isUrlResetModalOpen}
      onClose={() => setIsUrlResetModalOpen(false)}
      portal={resetPortalFromUrl}
      initialResetToken={resetTokenFromUrl ?? ''}
      initialEmail={resetEmailFromUrl ?? ''}
      onSuccessLogin={() => {
        setIsUrlResetModalOpen(false);
        navigateTo(resetPortalFromUrl === 'admin' ? '/admin' : '/login');
      }}
    />
  );

  // 1. ADMIN ROUTE: STRICTLY ACCESSIBLE ONLY AT /admin
  if (currentRoute.startsWith('/admin')) {
    return (
      <div className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-theme-bg text-theme-text transition-colors flex flex-col font-sans">
        <SkipLinks />
        <LiveAnnouncer />
        {!isAdminAuthenticated ? (
          <div className="flex-1 overflow-y-auto">
            <AdminLogin onReturnToStudent={() => navigateTo('/login')} />
          </div>
        ) : (
          <AdminPanel onReturnToStudent={() => navigateTo('/')} />
        )}
        <A11ySettingsModal />
        <A11yInspector />
        <ZoomResetFloatingPill />
        {emailResetModal}
      </div>
    );
  }

  // 2. PUBLIC GATE: no candidate is active. `/login` and `/register` show the
  // accessible sign-in flow; every other path shows the public landing page,
  // which is what a first-time visitor should meet instead of a password form.
  if (!currentStudent) {
    const wantsAuth =
      currentRoute.startsWith('/login') || currentRoute.startsWith('/register');

    if (wantsAuth) {
      return (
        <div className="min-h-screen bg-theme-bg text-theme-text transition-colors flex flex-col font-sans">
          <LiveAnnouncer />
          <header className="p-3 sm:p-4 border-b-2 border-theme-border bg-theme-surface">
            <div className="max-w-7xl mx-auto flex justify-between items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full border-2 border-theme-border bg-theme-primary text-theme-primary-text flex items-center justify-center font-black text-sm">
                  DX
                </span>
                <div>
                  <h1 className="text-base sm:text-lg font-bold text-theme-text leading-tight truncate">DristiX</h1>
                  <p className="text-xs text-theme-text-secondary hidden sm:block truncate">Accessible Online Examination Platform</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigateTo('/admin')}
                  className="h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-xl border-2 border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition focus:ring-4 focus:ring-indigo-500/50 shrink-0"
                  aria-label="Navigate to Examiner or Admin Studio"
                >
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden xs:inline sm:inline">Admin Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('/')}
                  aria-label="Back to home"
                  className="h-9 sm:h-10 px-2.5 sm:px-4 rounded-xl border-2 border-theme-border bg-theme-bg font-bold text-xs sm:text-sm text-theme-text hover:bg-theme-surface-elevated transition shrink-0"
                >
                  ← Back <span className="hidden sm:inline">to home</span>
                </button>
              </div>
            </div>
          </header>

          <main id="main-content" className="flex-1 pb-16 focus:outline-none">
            <StudentAuthScreen
              initialMode={currentRoute.startsWith('/register') ? 'register' : 'login'}
              onAuthenticated={() => {
                useExamStore.getState().resetToPortalFirstPage();
                navigateTo('/');
              }}
              onNavigateToAdmin={() => navigateTo('/admin')}
            />
          </main>
          <A11ySettingsModal />
          <A11yInspector />
          <ZoomResetFloatingPill />
          {emailResetModal}
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-theme-bg text-theme-text transition-colors flex flex-col font-sans">
        <SkipLinks />
        <LiveAnnouncer />
        <LandingPage
          onSignIn={() => navigateTo('/login')}
          onRegister={() => navigateTo('/register')}
        />
        <A11ySettingsModal />
        <A11yInspector />
        <ZoomResetFloatingPill />
        {emailResetModal}
      </div>
    );
  }

  // 3. STUDENT PORTAL: Active logged-in candidate view
  return (
    <div className="min-h-screen bg-theme-bg text-theme-text transition-colors flex flex-col font-sans">
      {/* Skip Navigation Links for Keyboard & Screen Reader Users */}
      <SkipLinks />

      {/* Persistent Global Live Broadcaster (polite & assertive live regions) */}
      <LiveAnnouncer />

      {/* Main Semantic Banner / Header */}
      <Header />

      {/* Primary Content Container: Catalog Dashboard vs Active Exam vs Diagnostic Report vs Analytics */}
      <div id="main-content" className={`flex-1 ${activeView === 'exam' && !isSubmitted ? 'pb-24 lg:pb-4' : 'pb-20 lg:pb-16'}`}>
        {activeView === 'analytics' ? (
          <StudentAnalyticsView onReturnToCatalog={returnToCatalog} />
        ) : activeView === 'catalog' ? (
          <ExamCatalogScreen />
        ) : isSubmitted ? (
          <DiagnosticReport />
        ) : (
          /* Active exam: two-column layout */
          <div className="flex flex-col lg:flex-row gap-4 items-start px-2 sm:px-4 lg:px-6 py-2 max-w-[1700px] mx-auto w-full">
            {/* Left: Question content */}
            <div className="flex-1 min-w-0 w-full">
              <ExamScreen />
            </div>
            {/* Right: Sidebar — Timer, Palette, Status, Progress */}
            <ExamSidebar />
          </div>
        )}
      </div>

      {/* Accessible Modals and Drawers (only active during Exam) */}
      {activeView === 'exam' && <QuestionPalette />}
      <A11ySettingsModal />
      <ShortcutsHelpModal />
      {activeView === 'exam' && <SubmitConfirmModal />}
      <ExamFeedbackModal />
      <TestUnavailableModal />

      {/* Live WCAG 2.1 AA Audit Inspector */}
      <A11yInspector />

      {/* Text Magnification Reset Safety Floating Pill */}
      <ZoomResetFloatingPill />

      {/* AI Conversational Voice Assistant */}
      <VoiceAssistantOrb />
      {emailResetModal}
    </div>
  );
};

export default App;
