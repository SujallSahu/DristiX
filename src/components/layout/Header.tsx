import React, { useState, useEffect } from 'react';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import {
  Volume2,
  VolumeX,
  Type,
  Settings,
  HelpCircle,
  LayoutGrid,
  CheckCircle2,
  Clock,
  BookOpen,
  Award,
  User,
  LogOut,
  TrendingUp,
  ArrowLeft,
  Mic,
  Sun,
} from 'lucide-react';
import { usePreferencesStore, type TextScale, type ThemeMode } from '../../store/usePreferencesStore';
import { useAuthStore } from '../../store/useAuthStore';
import { voiceRecognition } from '../../utils/voiceRecognition';
import type { VoiceState } from '../../utils/voiceRecognition';
import { soundEffects } from '../../utils/soundEffects';
import { speechEngine } from '../../utils/speechEngine';
import { StudentNotificationDropdown } from '../notifications/StudentNotificationDropdown';

export const Header: React.FC = () => {
  const {
    activeView,
    currentExam,
    returnToCatalog,
    openAnalytics,
    formattedTime,
    timeRemaining,
    examMode,
    setExamMode,
    isPaletteOpen,
    setPaletteOpen,
    setSettingsOpen,
    setShortcutsOpen,
    setSubmitModalOpen,
    isSubmitted,
  } = useExamStore();

  const { ttsEnabled, setTtsEnabled, fontSize, setFontSize, theme, setTheme } = usePreferencesStore();
  const { currentStudent, logoutStudent } = useAuthStore();

  const lastTextSizeChangeTime = React.useRef<number>(0);
  const clickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single Tap: Increase text size step by step (100% -> 125% -> 150% -> 175% -> 200%)
  const handleSingleTap = () => {
    lastTextSizeChangeTime.current = Date.now();
    soundEffects.playSelect();
    const current = usePreferencesStore.getState().fontSize;
    const fontSizes: TextScale[] = [100, 125, 150, 175, 200];
    const currentIndex = fontSizes.indexOf(current);

    if (currentIndex < fontSizes.length - 1) {
      const next = fontSizes[currentIndex + 1];
      setFontSize(next);
      useAnnouncerStore.getState().announce(`Text size increased to ${next} percent. Tab two times to reset to normal.`, 'polite', true);
    } else {
      useAnnouncerStore.getState().announce('Maximum text size: 200 percent. Tab two times to reset to normal.', 'polite', true);
    }
  };

  // Double Tap: Reset text size back to normal 100% — "There should be only one way to get back is that tab two times on it"
  const handleDoubleTap = () => {
    lastTextSizeChangeTime.current = Date.now();
    soundEffects.playSelect();

    // Ensure audio / TTS is definitely enabled and never muted
    if (!usePreferencesStore.getState().ttsEnabled) {
      setTtsEnabled(true);
    }
    speechEngine.enabled = true;

    setFontSize(100);
    useAnnouncerStore.getState().announce('Text size returned to normal: 100 percent.', 'polite', true);
  };

  const handleTextSizeClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      handleDoubleTap();
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        handleSingleTap();
      }, 280);
    }
  };

  const [voiceState, setVoiceState] = useState<VoiceState>(() => voiceRecognition.getState());

  useEffect(() => {
    const unsub = voiceRecognition.addListener({
      onTranscript: () => { },
      onStateChange: (state) => setVoiceState(state),
      onError: () => { },
    });
    return unsub;
  }, []);

  const handleAnnounceTime = () => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    useAnnouncerStore.getState().announce(
      `Current time remaining: ${minutes} minutes and ${seconds} seconds. Timer display: ${formattedTime}.`,
      'assertive',
      true
    );
  };

  const isTimeCritical = timeRemaining < 300; // Under 5 minutes

  return (
    <header
      role="banner"
      className="p-2 sm:p-3 md:p-4 border-b-2 border-theme-border/80 dx-glass transition-colors sticky top-0 z-30 shadow-md backdrop-blur-md overflow-visible"
    >
      <div className="max-w-[1700px] w-full mx-auto flex flex-col md:flex-row md:items-center justify-between gap-1.5 md:gap-2 overflow-visible">
        {/* Top Row on Mobile: Branding on Left, Candidate Profile + Sign Out or Exam Timer+Submit on Right */}
        <div className="flex items-center justify-between md:justify-start w-full md:w-auto shrink-0 gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <span
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border-2 border-theme-border bg-theme-primary text-theme-primary-text flex items-center justify-center font-black text-xs sm:text-sm shrink-0 shadow-sm"
              aria-hidden="true"
            >
              DX
            </span>
            <div className="flex flex-col justify-center shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <h1 className="text-sm sm:text-lg font-black text-theme-text leading-tight tracking-tight shrink-0 whitespace-nowrap">
                  DristiX
                </h1>
                {activeView === 'exam' && (
                  <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-extrabold bg-theme-border/50 text-theme-text border border-theme-border shrink-0 max-w-[220px] lg:max-w-[280px]">
                    <span
                      className={`font-mono whitespace-nowrap ${examMode === 'practice' ? 'text-emerald-500' : 'text-theme-primary'
                        }`}
                    >
                      {examMode === 'practice' ? '💡 ' : ''}
                      {currentExam.code}:
                    </span>
                    <span className="truncate inline-block max-w-[130px] lg:max-w-[180px]" title={currentExam.title}>
                      {currentExam.title}
                    </span>
                  </span>
                )}
              </div>
              <span className="text-xs text-theme-text/70 font-semibold hidden sm:inline whitespace-nowrap">
                {activeView === 'analytics'
                  ? 'Student Performance & Score Analytics'
                  : activeView === 'catalog'
                    ? 'Accessible Examination & Practice Portal'
                    : `${currentExam.questions.length} Questions • ${currentExam.durationMinutes} min`}
              </span>
            </div>
          </div>

          {/* Change Exam / Back to Catalog Button (when in Exam) */}
          {activeView === 'exam' && (
            <button
              type="button"
              onClick={() => {
                if (!isSubmitted) {
                  setSubmitModalOpen(true);
                  soundEffects.playTimerAlert();
                  useAnnouncerStore
                    .getState()
                    .announce(
                      'You cannot go back before submitting the exam. Submit confirmation window opened. Please confirm submission.',
                      'assertive',
                      true
                    );
                } else {
                  returnToCatalog();
                }
              }}
              title={
                !isSubmitted
                  ? 'Submit test before exiting'
                  : `Return to ${examMode === 'practice' ? 'Practice Arena' : 'Exam Catalog'}`
              }
              aria-label={
                !isSubmitted
                  ? 'Submit test before exiting'
                  : `Return to catalog`
              }
              className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border-2 border-theme-border bg-theme-bg hover:border-theme-primary text-theme-text text-xs font-extrabold flex items-center gap-1 sm:gap-1.5 transition-all shadow-xs shrink-0 whitespace-nowrap"
            >
              <span>{isSubmitted ? '📚' : '📝'}</span>
              <span className="hidden sm:inline">
                {isSubmitted
                  ? examMode === 'practice'
                    ? 'All Practice Tests'
                    : 'All Exams'
                  : 'Submit to Exit'}
              </span>
            </button>
          )}

          {/* Mode Switcher */}
          {activeView === 'exam' && !isSubmitted && (
            <div
              role="radiogroup"
              aria-label="Portal Mode"
              className="hidden lg:flex items-center p-1 border-2 border-theme-border rounded-xl bg-theme-bg/80 ml-1 shadow-xs"
            >
              <button
                type="button"
                role="radio"
                aria-checked={examMode === 'exam'}
                onClick={() => setExamMode('exam')}
                className={`px-2.5 py-1 text-xs font-extrabold rounded-lg flex items-center gap-1.5 transition-all ${examMode === 'exam'
                  ? 'bg-theme-primary text-theme-primary-text shadow-xs'
                  : 'text-theme-text hover:bg-theme-surface'
                  }`}
              >
                <Award className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Exam</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={examMode === 'practice'}
                onClick={() => setExamMode('practice')}
                className={`px-2.5 py-1 text-xs font-extrabold rounded-lg flex items-center gap-1.5 transition-all ${examMode === 'practice'
                  ? 'bg-theme-primary text-theme-primary-text shadow-xs'
                  : 'text-theme-text hover:bg-theme-surface'
                  }`}
              >
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Practice</span>
              </button>
            </div>
          )}

          {/* MOBILE-ONLY TOP-RIGHT: Candidate Profile with Sign Out (or Exam Timer + Submit) */}
          <div className="flex md:hidden items-center gap-1.5 shrink-0">
            {activeView === 'exam' && !isSubmitted ? (
              <>
                <button
                  type="button"
                  onClick={handleAnnounceTime}
                  title="Click or press T to speak remaining time"
                  aria-label={`Time Remaining: ${formattedTime}. Click to hear.`}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border-2 font-mono font-bold text-xs transition ${isTimeCritical
                    ? 'border-red-600 bg-red-950/20 text-red-500 animate-pulse'
                    : 'border-theme-border bg-theme-bg text-theme-text'
                    }`}
                >
                  <Clock className="w-3.5 h-3.5 text-theme-focus-ring shrink-0" aria-hidden="true" />
                  <span>{formattedTime}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubmitModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg border-2 border-theme-border bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1 transition shadow-sm shrink-0"
                  aria-label="Submit exam"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Submit</span>
                </button>
              </>
            ) : (
              currentStudent && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 border-theme-border bg-theme-bg text-xs shrink-0 max-w-[210px]">
                  <User className="w-3.5 h-3.5 text-theme-primary shrink-0" aria-hidden="true" />
                  <span className="font-bold text-theme-text truncate text-xs">
                    {currentStudent.name.split(' ')[0]}
                  </span>
                  <button
                    type="button"
                    onClick={() => void logoutStudent()}
                    className="btn-signout flex items-center gap-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 px-2 py-0.5 rounded-md shadow-xs transition-all cursor-pointer ml-1 shrink-0"
                    title="Sign out of student account (Ctrl + Enter)"
                    aria-label={`Sign out candidate ${currentStudent.name} (Shortcut: Ctrl + Enter)`}
                  >
                    <LogOut className="w-3 h-3 text-white" aria-hidden="true" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )
            )}
          </div>
        </div>

        {/* Center: Exam Timer (Desktop only — mobile renders in top right) */}
        {activeView === 'exam' && !isSubmitted && (
          <div
            role="region"
            aria-label="Exam Timer. Press T to announce time"
            className="hidden md:flex items-center gap-1 sm:gap-2 shrink-0"
          >
            <button
              type="button"
              onClick={handleAnnounceTime}
              title="Click or press T to speak remaining time"
              aria-label={`Time Remaining: ${formattedTime}. Click or press T to read aloud.`}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border-2 font-mono font-bold text-xs sm:text-base transition ${isTimeCritical
                ? 'border-red-600 bg-red-950/20 text-red-500 animate-pulse'
                : 'border-theme-border bg-theme-bg text-theme-text hover:border-theme-focus-ring'
                }`}
            >
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-focus-ring shrink-0" aria-hidden="true" />
              <span>
                <span className="sr-only">Time Remaining: </span>
                <span id="timer-display">{formattedTime}</span>
              </span>
              <kbd className="hidden md:inline-block px-1.5 py-0.2 text-[10px] uppercase font-sans border border-theme-border rounded bg-theme-surface">
                T
              </kbd>
            </button>
          </div>
        )}

        {/* Right / Toolbar: Quick Action Controls (Unified on mobile row 2, and right side on desktop) */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Accessibility quick controls toolbar"
          className="flex items-center justify-between md:justify-end gap-1 sm:gap-1.5 w-full md:w-auto overflow-x-auto md:overflow-visible no-scrollbar pt-1 md:pt-0 border-t border-theme-border/40 md:border-t-0 focus:outline-none"
        >
          {/* Current Student Profile Chip (Desktop) */}
          {currentStudent && activeView !== 'exam' && (
            <div className="hidden md:flex items-center gap-2.5 px-3 py-1 rounded-xl border-2 border-theme-border bg-theme-bg text-xs shrink-0 shadow-xs">
              <span className="font-bold text-theme-text flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-theme-primary" aria-hidden="true" />
                <span>{currentStudent.name}</span>
                <span className="text-theme-text/60 font-mono text-[11px]">({currentStudent.rollNumber})</span>
              </span>
              <button
                type="button"
                onClick={() => void logoutStudent()}
                className="btn-signout flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 shadow-xs transition-all cursor-pointer shrink-0"
                title="Sign out of student account (Ctrl + Enter)"
                aria-label={`Sign out candidate ${currentStudent.name} (Shortcut: Ctrl + Enter)`}
              >
                <LogOut className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                <span>Sign Out</span>
                <kbd className="hidden lg:inline-block ml-1 px-1 py-0.2 rounded text-[9px] font-mono bg-black/25 text-white/90 border border-white/20">
                  Ctrl+Enter
                </kbd>
              </button>
            </div>
          )}

          {/* Student Analytics / Performance View Button */}
          {activeView !== 'exam' && (
            activeView === 'analytics' ? (
              <button
                type="button"
                onClick={returnToCatalog}
                title="Return to Test Catalog (Shortcut: B or Esc)"
                aria-label="Return to Test Catalog (Shortcut: B or Esc)"
                className="px-2.5 py-1.5 rounded-lg border-2 border-theme-border bg-theme-bg hover:border-theme-primary text-theme-text text-xs font-bold flex items-center gap-1.5 transition focus:outline-none focus:ring-4 focus:ring-yellow-400"
              >
                <ArrowLeft className="w-4 h-4 text-theme-primary" aria-hidden="true" />
                <span>Back to Tests</span>
                <kbd className="hidden sm:inline-block text-[10px] font-sans font-bold px-1.5 py-0.2 rounded border border-theme-border bg-theme-surface">
                  B
                </kbd>
              </button>
            ) : (
              <button
                type="button"
                onClick={openAnalytics}
                title="My Performance & Score Analytics (Shortcut: D)"
                aria-label="My Performance and Score Analytics (Shortcut: D)"
                className="px-2.5 py-1.5 rounded-lg border-2 border-theme-border bg-theme-bg hover:border-emerald-500 text-theme-text text-xs font-bold flex items-center gap-1.5 transition focus:outline-none focus:ring-4 focus:ring-yellow-400"
              >
                <TrendingUp className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                <span className="hidden sm:inline">Analytics</span>
                <kbd className="hidden sm:inline-block text-[10px] font-sans font-bold px-1.5 py-0.2 rounded border border-theme-border bg-theme-surface">
                  D
                </kbd>
              </button>
            )
          )}

          {/* Student Notifications (Rule 2) */}
          <StudentNotificationDropdown />

          {/* AI Conversational Voice Assistant Button */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('dristix-toggle-voice'));
            }}
            title={
              voiceState === 'listening'
                ? 'AI Voice Assistant is listening (Click to pause, or press V)'
                : 'Activate AI Conversational Assistant (Shortcut: V)'
            }
            aria-label={
              voiceState === 'listening'
                ? 'AI Voice Assistant is active and listening. Click to mute or press V'
                : 'Activate AI Voice Assistant. Speak or control test via voice. Press V'
            }
            aria-pressed={voiceState === 'listening'}
            className={`p-1.5 sm:p-2 rounded-lg border-2 transition flex items-center gap-1 sm:gap-1.5 focus:outline-none focus:ring-4 focus:ring-yellow-400 shrink-0 ${voiceState === 'listening'
              ? 'bg-rose-600 border-rose-400 text-white shadow-lg animate-pulse'
              : 'border-theme-border bg-theme-bg text-theme-text hover:border-teal-400 hover:text-teal-400'
              }`}
          >
            {voiceState === 'listening' ? (
              <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white" aria-hidden="true" />
            ) : (
              <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-teal-400" aria-hidden="true" />
            )}
            <span className="hidden xl:inline text-xs font-bold">
              {voiceState === 'listening' ? 'Listening...' : 'Voice AI'}
            </span>
            <kbd
              className={`hidden sm:inline-block text-[11px] font-sans font-bold px-1.5 py-0.5 rounded border ${voiceState === 'listening'
                ? 'border-white/50 bg-slate-900 text-white'
                : 'border-theme-border bg-theme-surface text-theme-text'
                }`}
            >
              V
            </kbd>
          </button>

          {/* TTS Read Toggle */}
          <button
            type="button"
            onClick={() => {
              if (Date.now() - lastTextSizeChangeTime.current < 600) return;
              const next = !ttsEnabled;
              setTtsEnabled(next);
              useAnnouncerStore.getState().announce(
                next ? 'Built-in Text to Speech enabled.' : 'Built-in Text to Speech disabled.',
                'polite'
              );
            }}
            title={ttsEnabled ? 'Disable TTS Speech Output' : 'Enable TTS Speech Output'}
            aria-label={ttsEnabled ? 'Built-in Speech is ON. Click to disable.' : 'Built-in Speech is OFF. Click to enable.'}
            aria-pressed={ttsEnabled}
            className={`p-1.5 sm:p-2 rounded-lg border-2 border-theme-border transition shrink-0 ${ttsEnabled ? 'bg-theme-primary text-theme-primary-text' : 'bg-theme-bg text-theme-text'
              }`}
          >
            {ttsEnabled ? (
              <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            ) : (
              <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            )}
          </button>

          {/* Question Palette Button */}
          {activeView === 'exam' && !isSubmitted && (
            <button
              type="button"
              onClick={() => setPaletteOpen(!isPaletteOpen)}
              title="Open Question Palette (Shortcut: Q)"
              aria-label="Open Question Palette (Shortcut: Q)"
              aria-expanded={isPaletteOpen}
              className="p-1.5 sm:p-2 rounded-lg border-2 border-theme-border bg-theme-bg text-theme-text hover:bg-theme-surface transition flex items-center gap-1 font-semibold text-xs sm:text-sm shrink-0"
            >
              <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-theme-focus-ring" aria-hidden="true" />
              <span className="hidden lg:inline">Questions</span>
              <kbd className="hidden lg:inline text-[10px] px-1 border border-theme-border rounded">
                Q
              </kbd>
            </button>
          )}

          {/* Quick Text Size Toggle */}
          <button
            type="button"
            onClick={handleTextSizeClick}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current);
                clickTimerRef.current = null;
              }
              handleDoubleTap();
            }}
            aria-pressed={fontSize > 100}
            title={
              fontSize > 100
                ? `Text size: ${fontSize}% — Tab once to increase further, tab twice to reset to normal (100%)`
                : 'Text size: 100% (Normal) — Tab once to increase, tab twice to reset'
            }
            aria-label={
              fontSize > 100
                ? `Text size ${fontSize}% increased. Tab once to increase, tab twice to reset to normal.`
                : 'Text size 100% normal. Tab once to increase, tab twice to reset.'
            }
            className={`p-1.5 sm:p-2 rounded-lg border-2 border-theme-border transition flex items-center gap-1 sm:gap-1.5 focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400 shrink-0 ${fontSize > 100
              ? 'bg-theme-primary text-theme-primary-text border-theme-primary'
              : 'bg-theme-bg text-theme-text hover:bg-theme-surface'
              }`}
          >
            <Type className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            <kbd className="inline-block text-[10px] sm:text-[11px] font-sans font-bold px-1 sm:px-1.5 py-0.5 rounded border border-theme-border bg-theme-surface text-theme-text leading-tight shadow-xs">
              {fontSize}%
            </kbd>
          </button>

          {/* Quick Theme Switcher */}
          <button
            type="button"
            onClick={() => {
              soundEffects.playSelect();
              const themes: ThemeMode[] = ['teal-cream', 'liquid-glass', 'dark', 'high-contrast'];
              const idx = themes.indexOf(theme);
              const next = themes[(idx + 1) % themes.length];
              setTheme(next);
              const label =
                next === 'teal-cream'
                  ? 'Teal & Cream'
                  : next === 'liquid-glass'
                  ? 'Liquid Glass'
                  : next === 'dark'
                  ? 'Charcoal Dark'
                  : 'High Contrast';
              useAnnouncerStore
                .getState()
                .announce(`Theme changed to ${label}.`, 'assertive', true);
            }}
            title={`Current theme: ${theme}. Click to switch theme.`}
            aria-label={`Current theme: ${theme}. Click to switch theme.`}
            className="p-1.5 sm:p-2 rounded-lg border-2 border-theme-border bg-theme-bg text-theme-text hover:bg-theme-surface transition flex items-center gap-1 sm:gap-1.5 focus:outline-none focus:ring-4 focus:ring-theme-focus-ring focus:border-theme-focus-ring shrink-0"
          >
            <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" aria-hidden="true" />
            <span className="hidden xl:inline text-xs font-bold capitalize">
              {theme === 'teal-cream'
                ? 'Light'
                : theme === 'liquid-glass'
                ? 'Glass'
                : theme === 'dark'
                ? 'Dark'
                : 'Contrast'}
            </span>
          </button>

          {/* Accessibility Settings */}
          <button
            id="btn-a11y-settings"
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Accessibility Preferences (Shortcut: A)"
            aria-label="Accessibility Preferences (Shortcut: A)"
            className="p-1.5 sm:p-2 rounded-lg border-2 border-theme-border bg-theme-bg text-theme-text hover:bg-theme-surface transition flex items-center gap-1 sm:gap-1.5 focus:outline-none focus:ring-4 focus:ring-theme-focus-ring focus:border-theme-focus-ring shrink-0"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" aria-hidden="true" />
            <kbd className="hidden sm:inline-block text-[11px] font-sans font-bold px-1.5 py-0.5 rounded border border-theme-border bg-theme-surface">
              A
            </kbd>
          </button>

          {/* Keyboard Shortcuts Help */}
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard Shortcuts Reference (Shortcut: H or ?)"
            aria-label="Keyboard Shortcuts Reference (Shortcut: H or ?)"
            className="p-1.5 sm:p-2 rounded-lg border-2 border-theme-border bg-theme-bg text-theme-text hover:bg-theme-surface transition flex items-center gap-1 sm:gap-1.5 focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400 shrink-0"
          >
            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" aria-hidden="true" />
            <kbd className="hidden sm:inline-block text-[11px] font-sans font-bold px-1.5 py-0.5 rounded border border-theme-border bg-theme-surface">
              H
            </kbd>
          </button>

          {/* Submit Exam Button (Desktop) */}
          {activeView === 'exam' && !isSubmitted && (
            <button
              type="button"
              onClick={() => setSubmitModalOpen(true)}
              className="hidden md:flex ml-0.5 sm:ml-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border-2 border-theme-border bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm items-center gap-1 sm:gap-1.5 transition shadow-sm shrink-0"
              aria-label="Submit examination (Shortcut: Alt+S)"
            >
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
              <span>Submit</span>
              <kbd className="hidden xl:inline text-[10px] px-1 border border-white/40 rounded bg-white/10">
                Alt+S
              </kbd>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
