import { useEffect } from 'react';
import { useExamStore } from '../store/useExamStore';
import { useAuthStore } from '../store/useAuthStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import type { TextScale } from '../store/usePreferencesStore';
import { useAnnouncerStore } from '../store/useAnnouncerStore';
import { soundEffects } from '../utils/soundEffects';
import { speechEngine } from '../utils/speechEngine';
import { voiceRecognition } from '../utils/voiceRecognition';

/**
 * Checks if the currently active focused element is a text-entry field
 * where single-letter navigation shortcuts should be suppressed so user can type.
 * Radio buttons (exam options), checkboxes, and buttons MUST NOT suppress shortcuts!
 */
function isUserTyping(el: Element | null): boolean {
  if (!el) return false;
  const tagName = el.tagName.toUpperCase();
  if (tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable) return true;
  if (tagName === 'INPUT') {
    const inputType = ((el as HTMLInputElement).type || 'text').toLowerCase();
    const textTypes = ['text', 'search', 'password', 'email', 'tel', 'url', 'number'];
    return textTypes.includes(inputType);
  }
  return false;
}

export function useGlobalShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const store = useExamStore.getState();

      // Handle Escape to stop speech and close any open dialogs (available everywhere)
      if (e.key === 'Escape') {
        useAnnouncerStore.getState().stopSpeech();
        let handledModal = false;
        if (store.isPaletteOpen) { store.setPaletteOpen(false); handledModal = true; }
        if (store.isSettingsOpen) { store.setSettingsOpen(false); handledModal = true; }
        if (store.isShortcutsOpen) { store.setShortcutsOpen(false); handledModal = true; }
        if (store.isSubmitModalOpen) { store.setSubmitModalOpen(false); handledModal = true; }
        if (handledModal) return;
        if (store.activeView === 'analytics' || store.isSubmitted) { store.returnToCatalog(); return; }
        return;
      }

      // Shortcut: Sign out of Student Portal via 'Ctrl + Enter' (strictly student portal only)
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter')
      ) {
        if (store.feedback?.isOpen || store.isSubmitModalOpen) {
          return;
        }

        const auth = useAuthStore.getState();
        const isStudent = !!auth.currentStudent;
        const isAdmin = auth.isAdminAuthenticated;
        const isAdminPath =
          typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

        // Strictly student portal only
        if (isStudent && !isAdmin && !isAdminPath) {
          const tagName = activeEl?.tagName.toUpperCase();
          if (tagName === 'TEXTAREA') return;

          e.preventDefault();
          soundEffects.playSelect();
          void auth.logoutStudent();
          return;
        }
      }

      // Identify whether candidate is currently active in the Student Portal after login
      const auth = useAuthStore.getState();
      const isStudentPortal =
        Boolean(auth.currentStudent) &&
        !(typeof window !== 'undefined' && window.location.pathname.startsWith('/admin'));

      // Universal Speech Interruption Key ('s' / 'S')
      // Supports English, Hindi InScript ('े' / 'स' / 'ए'), physical KeyS, and keyCode 83
      const isStopKey =
        (
          (e.key && (e.key.toLowerCase() === 's' || e.key === 'े' || e.key === 'स' || e.key === 'ए')) ||
          e.code === 'KeyS' ||
          e.keyCode === 83 ||
          e.which === 83
        ) &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey;

      // Primary AI Voice Assistant Toggle Key ('v' / 'V' or 'Alt + V')
      // Supports English, Hindi InScript ('ल' / 'न'), physical KeyV, and keyCode 86
      const isToggleVoiceKey =
        (
          (e.key && (e.key.toLowerCase() === 'v' || e.key === 'ल' || e.key === 'न')) ||
          e.code === 'KeyV' ||
          e.keyCode === 86 ||
          e.which === 86 ||
          (e.altKey && (e.key?.toLowerCase() === 'v' || e.code === 'KeyV' || e.key === 'ल' || e.key === 'न'))
        ) &&
        !e.ctrlKey &&
        !e.metaKey;

      // Voice Language Switch Key ('l' / 'L' or 'Alt + L' toggles English ↔ Hindi)
      // Supports English, Hindi InScript ('त' / 'ल'), physical KeyL, and keyCode 76
      const isLangKey =
        (
          (e.key && (e.key.toLowerCase() === 'l' || e.key === 'त' || e.key === 'ल')) ||
          e.code === 'KeyL' ||
          e.keyCode === 76 ||
          e.which === 76
        ) &&
        !e.ctrlKey &&
        !e.metaKey;

      const isAssistantVocalizing =
        speechEngine.isSpeaking() ||
        voiceRecognition.getState() === 'speaking';

      // REQUIREMENT: Stop button 'S' operates strictly in the student portal after login only.
      // Operates immediately across all modal dialogs, active exams, catalog, and dashboard.
      if (isStopKey && isStudentPortal) {
        const isTyping = isUserTyping(activeEl);
        if (!isTyping || isAssistantVocalizing) {
          e.preventDefault();
          useAnnouncerStore.getState().stopSpeech();
          soundEffects.playSelect();
          return;
        }
      }

      // Voice Assistant Toggle ('V' or 'Alt+V')
      // Available globally and across modals without freezing or getting stuck
      if (isToggleVoiceKey) {
        const isTyping = isUserTyping(activeEl);
        if (!isTyping || e.altKey) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('dristix-toggle-voice'));
          return;
        }
      }

      // Voice Language Toggle ('L' or 'Alt+L')
      if (isLangKey) {
        const isTyping = isUserTyping(activeEl);
        if (!isTyping || e.altKey) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('dristix-toggle-voice-language'));
          return;
        }
      }

      // Alt+A for Settings, Alt+H for Shortcuts Guide
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        store.setSettingsOpen(true);
        return;
      }
      if (e.altKey && (e.key === 'h' || e.key === 'H' || e.key === '?')) {
        e.preventDefault();
        store.setShortcutsOpen(true);
        return;
      }

      // If full modal dialogs (Settings or Shortcuts Help) are open, let them handle keys internally
      if (store.isSettingsOpen || store.isShortcutsOpen) {
        return;
      }

      // If Submit Confirmation Modal is open during active exam, let it handle Enter/Tab/Escape
      if (store.activeView === 'exam' && store.isSubmitModalOpen) {
        return;
      }

      // If Question Palette is open during an exam, pressing 'q' or 'Q' closes it
      if (store.activeView === 'exam' && store.isPaletteOpen) {
        if (e.key.toLowerCase() === 'q') {
          e.preventDefault();
          store.setPaletteOpen(false);
          return;
        }
        // Palette is open: do not execute question-answering shortcuts
        return;
      }

      // If user is actively typing in a text field, let native typing happen
      if (isUserTyping(activeEl)) return;

      // Global Text & UI Scaling shortcuts (+, =, -, _, Add, Subtract, and 0 to reset)
      // Visually impaired users can quickly zoom in/out or reset zoom anywhere in the application
      // Supports both bare keys (+ / - / 0) and standard browser combos (Ctrl + + / Ctrl + - / Ctrl + 0)
      if (!e.metaKey) {
        // Reset Zoom to 100% via '0', 'Ctrl+0', 'Alt+0', 'Digit0', 'Numpad0'
        if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          usePreferencesStore.getState().setFontSize(100);
          soundEffects.playSelect();
          useAnnouncerStore
            .getState()
            .announce('Text size returned to normal: 100 percent.', 'assertive', true);
          return;
        }

        // Increase Zoom
        if (e.key === '+' || e.key === '=' || e.key === 'Add') {
          e.preventDefault();
          const fontSizes: TextScale[] = [100, 125, 150, 175, 200];
          const currentFont = usePreferencesStore.getState().fontSize;
          const currentIndex = fontSizes.indexOf(currentFont);
          if (currentIndex < fontSizes.length - 1) {
            const nextFont = fontSizes[currentIndex + 1];
            usePreferencesStore.getState().setFontSize(nextFont);
            soundEffects.playSelect();
            useAnnouncerStore
              .getState()
              .announce(`Text scale adjusted to ${nextFont} percent. Press 0 to reset.`, 'assertive', true);
          } else {
            useAnnouncerStore
              .getState()
              .announce('Maximum magnification limit of 200 percent reached. Press 0 to reset to 100 percent.', 'polite', true);
          }
          return;
        }

        // Decrease Zoom
        if (e.key === '-' || e.key === '_' || e.key === 'Subtract') {
          e.preventDefault();
          const fontSizes: TextScale[] = [100, 125, 150, 175, 200];
          const currentFont = usePreferencesStore.getState().fontSize;
          const currentIndex = fontSizes.indexOf(currentFont);
          if (currentIndex > 0) {
            const nextFont = fontSizes[currentIndex - 1];
            usePreferencesStore.getState().setFontSize(nextFont);
            soundEffects.playSelect();
            useAnnouncerStore
              .getState()
              .announce(`Text scale adjusted to ${nextFont} percent.`, 'assertive', true);
          } else {
            useAnnouncerStore
              .getState()
              .announce('Minimum magnification limit of 100 percent reached.', 'polite', true);
          }
          return;
        }
      }

      // Before sign-in there is no portal behind these keys. Only the scaling
      // shortcuts above, stop-speech and accessibility settings belong on the
      // public landing page and sign-in flow — anything else would move the
      // exam store into a view the visitor cannot see, and the portal would
      // open on that view after they sign in.
      // Shortcuts Guide help window ('?' or 'H' or 'F1')
      if (e.key === '?' || e.key.toLowerCase() === 'h' || e.key === 'F1') {
        e.preventDefault();
        store.setShortcutsOpen(true);
        return;
      }

      // Accessibility Preferences dialog ('A' without modifier)
      if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        store.setSettingsOpen(true);
        return;
      }

      if (!isStudentPortal) {
        return;
      }
      // Toggle Student Performance & Analytics Dashboard 'd' or 'D'
      if (e.key.toLowerCase() === 'd' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (store.activeView === 'analytics') {
          store.returnToCatalog();
        } else if (store.activeView === 'catalog') {
          store.openAnalytics();
        }
        return;
      }

      // Back to Catalog 'b' or 'B' (when in Analytics view OR when viewing Diagnostic Report)
      if (
        e.key.toLowerCase() === 'b' &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (store.activeView === 'analytics' || store.isSubmitted)
      ) {
        e.preventDefault();
        store.returnToCatalog();
        return;
      }

      // On Diagnostic Report screen: 'r' to retake, 's' to read summary, 'f' to open feedback
      if (store.isSubmitted) {
        if (e.key.toLowerCase() === 'f' && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          store.openFeedbackModal(true);
          return;
        }
        if (e.key.toLowerCase() === 'r' && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          store.resetExam();
          return;
        }
        return;
      }

      // Alt + S -> Submit Exam Session (only when in active unsubmitted exam)
      if (
        e.altKey &&
        (e.key === 's' || e.key === 'S' || e.code === 'KeyS' || e.key === 'े' || e.key === 'स' || e.keyCode === 83)
      ) {
        e.preventDefault();
        if (store.activeView === 'exam' && !store.isSubmitted) {
          store.setSubmitModalOpen(true);
        }
        return;
      }

      // Active Exam Shortcuts (when in active exam view and not submitted)
      if (store.activeView === 'exam' && !store.isSubmitted) {
        switch (e.key.toLowerCase()) {
          case 'r':
            // Read question, equation, and options aloud
            e.preventDefault();
            store.announceCurrentQuestion(true);
            break;

          case 'n':
          case 'arrowright':
            e.preventDefault();
            store.nextQuestion();
            break;

          case 'p':
          case 'arrowleft':
            e.preventDefault();
            store.previousQuestion();
            break;

          case 'm':
          case 'u':
            e.preventDefault();
            store.toggleMarkForReview();
            break;

          case 'o': {
            e.preventDefault();
            const curQ = store.questions[store.currentIndex];
            const total = store.questions.length;
            const attempted = Object.keys(store.selectedOptions).length;
            const unattempted = Math.max(0, total - attempted);
            const marked = Object.values(store.markedForReview).filter(Boolean).length;
            const minutes = Math.floor(store.timeRemaining / 60);
            const seconds = store.timeRemaining % 60;
            const selectedOpt = curQ ? store.selectedOptions[curQ.id] : undefined;
            const isMarked = curQ ? !!store.markedForReview[curQ.id] : false;
            const statusDesc = selectedOpt
              ? `Answered with Option ${selectedOpt} selected`
              : 'Unanswered';
            const markDesc = isMarked ? ', Marked for review' : '';
            const diagramDesc = curQ?.diagramUrl || curQ?.diagramDescription ? '. Includes visual diagram' : '';
            const msg = `Question ${store.currentIndex + 1} of ${total} in section ${curQ?.section || 'General'}. Status: ${statusDesc}${markDesc}${diagramDesc}. Test attempts: ${attempted} answered, ${unattempted} unattempted, ${marked} marked for review. ${minutes} minutes and ${seconds} seconds remaining.`;
            useAnnouncerStore.getState().announce(msg, 'assertive', true);
            break;
          }

          case '1':
            e.preventDefault();
            store.selectOption(1);
            break;

          case '2':
            e.preventDefault();
            store.selectOption(2);
            break;

          case '3':
            e.preventDefault();
            store.selectOption(3);
            break;

          case '4':
            e.preventDefault();
            store.selectOption(4);
            break;

          case 'c':
            e.preventDefault();
            store.clearOption();
            break;

          case 't': {
            e.preventDefault();
            const minutes = Math.floor(store.timeRemaining / 60);
            const seconds = store.timeRemaining % 60;
            const timeMsg = `Time remaining: ${minutes} minutes and ${seconds} seconds. Timer display: ${store.formattedTime}.`;
            useAnnouncerStore.getState().announce(timeMsg, 'assertive', true);
            window.dispatchEvent(new CustomEvent('dristix-announce-time'));
            break;
          }

          case 'q':
            e.preventDefault();
            if (!store.isPaletteOpen) {
              window.dispatchEvent(new CustomEvent('dristix-announce-palette'));
            }
            store.setPaletteOpen(!store.isPaletteOpen);
            break;

          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
