import React, { useState, useEffect } from 'react';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import {
  Volume2,
  VolumeX,
  Settings,
  HelpCircle,
  LayoutGrid,
  CheckCircle2,
  Clock,
  BookOpen,
  Award,
  User,
  TrendingUp,
  ArrowLeft,
  Mic,
} from 'lucide-react';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { useAuthStore } from '../../store/useAuthStore';
import { voiceRecognition } from '../../utils/voiceRecognition';
import type { VoiceState } from '../../utils/voiceRecognition';
import { soundEffects } from '../../utils/soundEffects';
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

  const { ttsEnabled, setTtsEnabled } = usePreferencesStore();
  const { currentStudent, logoutStudent } = useAuthStore();

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
      className="p-3 sm:p-4 border-b-2 border-theme-border/80 dx-glass transition-colors sticky top-0 z-30 shadow-md backdrop-blur-md overflow-visible"
    >
      <div className="max-w-[1700px] w-full mx-auto flex flex-nowrap justify-between items-center gap-2 overflow-visible">
        {/* Portal Branding and Exam Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="w-9 h-9 rounded-xl border-2 border-theme-border bg-theme-primary text-theme-primary-text flex items-center justify-center font-black text-sm shrink-0 shadow-sm"
              aria-hidden="true"
            >
              DX
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-theme-text leading-tight tracking-tight">
                  DristiX
                </h1>
                {activeView === 'exam' && (
                  <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-theme-border/50 text-theme-text border border-theme-border">
                    <span
                      className={`font-mono ${examMode === 'practice' ? 'text-emerald-500' : 'text-theme-primary'
                        }`}
                    >
                      {examMode === 'practice' ? '💡 ' : ''}
                      {currentExam.code}:
                    </span>
                    <span className="max-w-[200px] truncate" title={currentExam.title}>
                      {currentExam.title}
                    </span>
                  </span>
                )}
              </div>
              <span className="text-xs text-theme-text/70 font-semibold hidden sm:inline">
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
              className="px-3 py-1.5 rounded-xl border-2 border-theme-border bg-theme-bg hover:border-theme-primary text-theme-text text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-xs ml-1"
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
        </div>

        {/* Center: Exam Timer (only during active exam) */}
        {activeView === 'exam' && !isSubmitted && (
          <div
            role="region"
            aria-label="Exam Timer. Press T to announce time"
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={handleAnnounceTime}
              title="Click or press T to speak remaining time"
              aria-label={`Time Remaining: ${formattedTime}. Click or press T to read aloud.`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 font-mono font-bold text-base transition ${isTimeCritical
                ? 'border-red-600 bg-red-950/20 text-red-500 animate-pulse'
                : 'border-theme-border bg-theme-bg text-theme-text hover:border-theme-focus-ring'
                }`}
            >
              <Clock className="w-4 h-4 text-theme-focus-ring" aria-hidden="true" />
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

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Current Student Profile Chip */}
          {currentStudent && activeView !== 'exam' && (
            <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-lg border-2 border-theme-border bg-theme-bg text-xs">
              <span className="font-bold text-theme-text flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-theme-primary" aria-hidden="true" />
                <span>{currentStudent.name}</span>
                <span className="text-theme-text/60 font-mono text-[11px]">({currentStudent.rollNumber})</span>
              </span>
              <button
                type="button"
                onClick={() => void logoutStudent()}
                className="ml-1 text-xs font-bold text-red-700 dark:text-red-400 hover:text-red-800 underline cursor-pointer"
                title="Sign out of student account"
                aria-label={`Sign out candidate ${currentStudent.name}`}
              >
                Sign Out
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
          {currentStudent && <StudentNotificationDropdown />}

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
            className={`p-2 rounded-lg border-2 transition flex items-center gap-1.5 focus:outline-none focus:ring-4 focus:ring-yellow-400 ${voiceState === 'listening'
              ? 'bg-rose-600 border-rose-400 text-white shadow-lg animate-pulse'
              : 'border-theme-border bg-theme-bg text-theme-text hover:border-teal-400 hover:text-teal-400'
              }`}
          >
            {voiceState === 'listening' ? (
              <Mic className="w-5 h-5 text-white" aria-hidden="true" />
            ) : (
              <Mic className="w-5 h-5 text-teal-400" aria-hidden="true" />
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
            className={`p-2 rounded-lg border-2 border-theme-border transition ${ttsEnabled ? 'bg-theme-primary text-theme-primary-text' : 'bg-theme-bg text-theme-text'
              }`}
          >
            {ttsEnabled ? (
              <Volume2 className="w-5 h-5" aria-hidden="true" />
            ) : (
              <VolumeX className="w-5 h-5" aria-hidden="true" />
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
              className="p-2 rounded-lg border-2 border-theme-border bg-theme-bg text-theme-text hover:bg-theme-surface transition flex items-center gap-1 font-semibold text-sm"
            >
              <LayoutGrid className="w-5 h-5 text-theme-focus-ring" aria-hidden="true" />
              <span className="hidden lg:inline">Questions</span>
              <kbd className="hidden lg:inline text-[10px] px-1 border border-theme-border rounded">
                Q
              </kbd>
            </button>
          )}

          {/* Accessibility Settings */}
          <button
            id="btn-a11y-settings"
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Accessibility Preferences (Shortcut: A)"
            aria-label="Accessibility Preferences (Shortcut: A)"
            className="p-2 rounded-lg border-2 border-theme-border bg-theme-bg text-theme-text hover:bg-theme-surface transition flex items-center gap-1.5 focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400"
          >
            <Settings className="w-5 h-5 text-yellow-400" aria-hidden="true" />
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
            className="p-2 rounded-lg border-2 border-theme-border bg-theme-bg text-theme-text hover:bg-theme-surface transition flex items-center gap-1.5 focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400"
          >
            <HelpCircle className="w-5 h-5 text-yellow-400" aria-hidden="true" />
            <kbd className="hidden sm:inline-block text-[11px] font-sans font-bold px-1.5 py-0.5 rounded border border-theme-border bg-theme-surface">
              H
            </kbd>
          </button>

          {/* Submit Exam Button */}
          {activeView === 'exam' && !isSubmitted && (
            <button
              type="button"
              onClick={() => setSubmitModalOpen(true)}
              className="ml-1 sm:ml-2 px-3 py-1.5 rounded-lg border-2 border-theme-border bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm flex items-center gap-1.5 transition shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
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
