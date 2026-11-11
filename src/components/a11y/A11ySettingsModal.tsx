import React, { useEffect, useRef } from 'react';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import type { ThemeMode, TextScale } from '../../store/usePreferencesStore';
import { useExamStore } from '../../store/useExamStore';
import { speechEngine, EDGE_TTS_VOICES } from '../../utils/speechEngine';
import { soundEffects } from '../../utils/soundEffects';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { geminiVoiceService } from '../../utils/geminiVoiceService';
import { earconManager, hapticManager } from '../../accessibility';
import { isHindiPreferred } from '../../utils/voiceRecognition';
import { X, Sun, Volume2, Type, Sliders, Bell, Keyboard, Sparkles, Key, Terminal } from 'lucide-react';

export const A11ySettingsModal: React.FC = () => {
  const {
    theme,
    fontSize,
    dyslexicFont,
    ttsEnabled,
    ttsRate,
    ttsPitch,
    ttsVoice,
    autoReadOnNavigate,
    audioFeedbackEnabled,
    earconsEnabled,
    hapticEnabled,
    acousticStagingEnabled,
    a11yDebugMode,
    setTheme,
    setFontSize,
    setDyslexicFont,
    setTtsEnabled,
    setTtsRate,
    setTtsPitch,
    setTtsVoice,
    setAutoReadOnNavigate,
    setAudioFeedbackEnabled,
    setEarconsEnabled,
    setHapticEnabled,
    setAcousticStagingEnabled,
    setA11yDebugMode,
  } = usePreferencesStore();

  const { isSettingsOpen, setSettingsOpen } = useExamStore();
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);

  const themeButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const fontButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  type SectionIdentifier = 1 | 2 | 3 | 4 | 5 | 'close' | 'done';

  const currentFocusedSectionRef = useRef<SectionIdentifier | null>(null);
  const currentFocusedSubcategoryRef = useRef<string | null>(null);
  const lastSectionShiftTimeRef = useRef<number>(0);
  const isInitialOpenRef = useRef<boolean>(false);
  const suppressSectionAnnounceRef = useRef<boolean>(false);

  const handleSectionFocus = (sectionId: SectionIdentifier) => {
    if (isInitialOpenRef.current || suppressSectionAnnounceRef.current) return;
    if (currentFocusedSectionRef.current === sectionId) return;

    currentFocusedSectionRef.current = sectionId;
    currentFocusedSubcategoryRef.current = null;
    lastSectionShiftTimeRef.current = Date.now();
    soundEffects.playNavigate();

    const inHindi = isHindiPreferred();
    let announcement = '';

    switch (sectionId) {
      case 1:
        announcement = inHindi
          ? 'सेक्शन 1: डायनामिक कंट्रास्ट थीम्स। इसमें 4 उच्च कंट्रास्ट रंग थीम शामिल हैं: टील एंड क्रीम, लिक्विड ग्लास, चारकोल डार्क, और हाई कंट्रास्ट ब्लैक एंड येलो। थीम बदलने के लिए एरो कीज़ या 1 से 4 नंबर दबाएं।'
          : 'Shifted to Section 1: Dynamic Contrast Themes. Features 4 high-contrast color palettes: Teal and Cream, Liquid Glass, Charcoal Dark, and High Contrast Black and Yellow. Use arrow keys or numbers 1 to 4 to switch themes.';
        break;
      case 2:
        announcement = inHindi
          ? 'सेक्शन 2: टेक्स्ट और यूआई स्केलिंग। इसमें दो प्रमुख फीचर्स हैं: 100 से 200 प्रतिशत टेक्स्ट मैग्निफिकेशन, और डिस्लेक्सिया व लो-विज़न के लिए एन्हांस्ड लेटर स्पेसिंग। मैग्निफिकेशन के लिए एरो कीज़ या 1 से 5 नंबर दबाएं, या स्पेसिंग टॉगल के लिए Tab दबाएं।'
          : 'Shifted to Section 2: Text and UI Scaling. Features include text magnification presets from 100 to 200 percent, and enhanced letter spacing for dyslexia and low-vision. Use arrow keys or numbers 1 to 5 to change magnification, or Tab for dyslexia spacing.';
        break;
      case 3:
        announcement = inHindi
          ? 'सेक्शन 3: इंटीग्रेटेड स्पीच सिंथेसिस। इसमें शामिल हैं: बिल्ट-इन टेक्स्ट-टू-स्पीच रीडर, ऑटो-रीड ऑन नेविगेट, स्पीच गति और पिच स्लाइडर्स, माइक्रोसॉफ्ट एज न्यूरल वॉइस सेलेक्टर, और ऑडियो टेस्ट बटन्स।'
          : 'Shifted to Section 3: Integrated Speech Synthesis. Features include: built-in text-to-speech reader, auto-read on navigate, speech rate and pitch sliders, Microsoft Edge Neural voice engine selector, and live speech test buttons.';
        break;
      case 4:
        announcement = inHindi
          ? 'सेक्शन 4: मल्टी-सेंसरी एक्सेसिबिलिटी कोर। इसमें 5 संवेदी फीचर्स हैं: मास्टर ऑडियो टॉगल, हार्मोनिक इयरकॉन्स, अकौस्टिक स्टेजिंग कैडेंस, हैप्टिक वाइब्रेशन, और एक्सेसिबिलिटी इवेंट लॉगर।'
          : 'Shifted to Section 4: Multi-Sensory Accessibility Core. Features 5 auditory and tactile tools: master audio toggle, non-speech harmonic earcons, acoustic staging cadence, haptic vibration pulses, and accessibility developer event logging.';
        break;
      case 5:
        announcement = inHindi
          ? 'सेक्शन 5: एआई डुअल इंजन। इसमें दो फीचर्स हैं: प्राइमरी गूगल जेमिनी एआई की इनपुट, और 500 टोकन प्रति सेकंड हाई-स्पीड ग्रोक एललामा बैकअप की कॉन्फ़िगरेशन।'
          : 'Shifted to Section 5: AI Dual Engine. Features include: primary Google Gemini AI key configuration, and failover high-speed Groq LLaMA key setup for 500 tokens per second resilient failover.';
        break;
      case 'done':
        announcement = inHindi
          ? 'डन और सेव प्रेफरेंसेस बटन। सभी एक्सेसिबिलिटी सेटिंग्स सहेजने और बंद करने के लिए Enter दबाएं।'
          : 'Shifted to Done and Save Preferences button. Press Enter or Space to save all accessibility preferences and close.';
        break;
      case 'close':
        announcement = inHindi
          ? 'क्लोज़ एक्सेसिबिलिटी सेटिंग्स बटन। बंद करने के लिए Enter दबाएं, या आगे बढ़ने के लिए Tab दबाएं।'
          : 'Shifted to Close Accessibility Settings button. Press Enter to close, or Tab to navigate to Section 1.';
        break;
    }

    if (announcement) {
      useAnnouncerStore.getState().announce(announcement, 'assertive', true, true);
    }
  };

  const handleSubcategoryFocus = (
    subcategoryId: string,
    englishText: string,
    hindiText?: string,
    isFirstSectionItem: boolean = false
  ) => {
    if (isInitialOpenRef.current || suppressSectionAnnounceRef.current) return;
    // If we just entered this section within the last 1800ms and this is the first item, let the section overview speech finish
    if (isFirstSectionItem && Date.now() - lastSectionShiftTimeRef.current < 1800) {
      currentFocusedSubcategoryRef.current = subcategoryId;
      return;
    }
    if (currentFocusedSubcategoryRef.current === subcategoryId) return;

    currentFocusedSubcategoryRef.current = subcategoryId;

    const inHindi = isHindiPreferred();
    const announcement = inHindi && hindiText ? hindiText : englishText;
    if (announcement) {
      useAnnouncerStore.getState().announce(announcement, 'polite', true, true);
    }
  };

  const themes: Array<{
    id: ThemeMode;
    label: string;
    desc: string;
    icon: string;
    preview: {
      bg: string;
      surface: string;
      text: string;
      primary: string;
      border: string;
      badge: string;
    };
  }> = [
    {
      id: 'teal-cream',
      label: 'Teal & Cream',
      desc: 'Warm Ivory background, Deep Teal primary, Amber focus ring — WCAG AAA (13:1+)',
      icon: '🌿',
      preview: {
        bg: '#F7F4EF',
        surface: '#FFFFFF',
        text: '#1A2E2E',
        primary: '#0D6E6E',
        border: '#C5BFB4',
        badge: 'Warm Ivory',
      },
    },
    {
      id: 'liquid-glass',
      label: 'Liquid Glass (Frosted Light)',
      desc: 'Pearlescent frosted glass, Royal Amethyst purple accents, Translucent crystal surfaces — WCAG AAA (15:1+)',
      icon: '✨',
      preview: {
        bg: '#F4F1FA',
        surface: 'rgba(255, 255, 255, 0.85)',
        text: '#1B1428',
        primary: '#7C3AED',
        border: 'rgba(124, 58, 237, 0.30)',
        badge: 'Frosted Light',
      },
    },
    {
      id: 'dark',
      label: 'Charcoal Dark (Emerald)',
      desc: 'Deep matte charcoal background, Vivid Emerald green primary, Amber focus ring — WCAG AAA (13:1+)',
      icon: '🌙',
      preview: {
        bg: '#111315',
        surface: '#1A1D20',
        text: '#F3F4F6',
        primary: '#10B981',
        border: '#374151',
        badge: 'Emerald Green',
      },
    },
    {
      id: 'high-contrast',
      label: 'High Contrast',
      desc: 'Pure Black (#000), Electric Yellow (#FFEE00), 21:1 maximum contrast — WCAG AAA',
      icon: '⚡',
      preview: {
        bg: '#000000',
        surface: '#0A0A0A',
        text: '#FFEE00',
        primary: '#FFEE00',
        border: '#FFEE00',
        badge: 'Black & Yellow',
      },
    },
  ];


  const fontSizes: TextScale[] = [100, 125, 150, 175, 200];

  // Initial focus and voice speech announcement
  useEffect(() => {
    if (isSettingsOpen) {
      isInitialOpenRef.current = true;
      currentFocusedSectionRef.current = 1;

      const timer = setTimeout(() => {
        const activeThemeIdx = themes.findIndex((t) => t.id === theme);
        if (activeThemeIdx >= 0 && themeButtonRefs.current[activeThemeIdx]) {
          themeButtonRefs.current[activeThemeIdx]?.focus();
        } else {
          closeButtonRef.current?.focus();
        }

        setTimeout(() => {
          isInitialOpenRef.current = false;
        }, 300);
      }, 60);

      const inHindi = isHindiPreferred();
      useAnnouncerStore
        .getState()
        .announce(
          inHindi
            ? 'एक्सेसिबिलिटी प्राथमिकताएँ विंडो खुल गई है। थीम, फ़ॉन्ट आकार और ध्वनि सेटिंग्स बदलने के लिए टैब या एरो कुंजियों का उपयोग करें। बंद करने के लिए Escape दबाएँ।'
            : 'Accessibility Preferences modal opened. Use Tab or Arrow keys to navigate between themes, text scaling, speech, and sound settings. Press Escape to close.',
          'assertive',
          true,
          true
        );

      return () => clearTimeout(timer);
    } else {
      currentFocusedSectionRef.current = null;
      isInitialOpenRef.current = false;
    }
  }, [isSettingsOpen]);

  // Global Escape key capture listener to guarantee modal closes regardless of which element has focus
  useEffect(() => {
    if (!isSettingsOpen) return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSettingsOpen(false);
        soundEffects.playSelect();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown, { capture: true });
    };
  }, [isSettingsOpen, setSettingsOpen]);

  // Magnification Step Helper (Increases or Decreases scale and announces status)
  const stepFontSize = (direction: 'increase' | 'decrease') => {
    suppressSectionAnnounceRef.current = true;
    setTimeout(() => {
      suppressSectionAnnounceRef.current = false;
    }, 250);

    const currentIndex = fontSizes.indexOf(fontSize);
    let nextIndex = currentIndex;

    if (direction === 'increase') {
      nextIndex = Math.min(currentIndex + 1, fontSizes.length - 1);
    } else {
      nextIndex = Math.max(currentIndex - 1, 0);
    }

    if (nextIndex !== currentIndex) {
      const newScale = fontSizes[nextIndex];
      setFontSize(newScale);
      fontButtonRefs.current[nextIndex]?.focus();
      soundEffects.playSelect();
      useAnnouncerStore
        .getState()
        .announce(`Text scale adjusted to ${newScale} percent.`, 'assertive', true);
    } else {
      useAnnouncerStore
        .getState()
        .announce(
          direction === 'increase'
            ? 'Maximum magnification limit of 200 percent reached.'
            : 'Minimum magnification limit of 100 percent reached.',
          'polite',
          true
        );
    }
  };

  // Full Keyboard Trap & Navigation Handler (Tab, Shift+Tab, Escape, Magnification Shortcuts)
  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Isolate all keyboard events to the modal so they never leak to background catalog shortcuts or filters
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      setSettingsOpen(false);
      soundEffects.playSelect();
      return;
    }

    // Modal-wide Magnification / Zoom shortcuts (+, =, -, _)
    // Works from anywhere inside the modal unless user is actively typing in a text field
    const activeEl = document.activeElement;
    const isTextInput =
      activeEl &&
      (activeEl.tagName === 'TEXTAREA' ||
        (activeEl.tagName === 'INPUT' &&
          ['text', 'search', 'number', 'password', 'email'].includes(
            (activeEl as HTMLInputElement).type || 'text'
          )));

    if (!isTextInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '+' || e.key === '=' || e.key === 'Add') {
        e.preventDefault();
        e.stopPropagation();
        stepFontSize('increase');
        return;
      }
      if (e.key === '-' || e.key === '_' || e.key === 'Subtract') {
        e.preventDefault();
        e.stopPropagation();
        stepFontSize('decrease');
        return;
      }
    }

    // Direct Section Jump Shortcuts: Alt+1 through Alt+5
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === '1') {
        e.preventDefault();
        e.stopPropagation();
        const activeThemeIdx = themes.findIndex((t) => t.id === theme);
        themeButtonRefs.current[activeThemeIdx >= 0 ? activeThemeIdx : 0]?.focus();
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        e.stopPropagation();
        const activeFontIdx = fontSizes.indexOf(fontSize);
        fontButtonRefs.current[activeFontIdx >= 0 ? activeFontIdx : 0]?.focus();
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        e.stopPropagation();
        const el =
          (document.getElementById('tts-rate-slider') as HTMLElement) ||
          (document.querySelector('[aria-labelledby="speech-heading"] input') as HTMLElement);
        el?.focus();
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        e.stopPropagation();
        const el = document.querySelector('[aria-labelledby="sound-heading"] input') as HTMLElement;
        el?.focus();
        return;
      }
      if (e.key === '5') {
        e.preventDefault();
        e.stopPropagation();
        const el = document.getElementById('gemini-key-input') as HTMLElement;
        el?.focus();
        return;
      }
    }

    if (e.key === 'Tab') {
      const container = modalContainerRef.current;
      if (!container) return;

      const focusableElements = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const firstEl = focusableElements[0];
      const lastEl = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  };

  // Arrow Key Navigation for Themes (WCAG Radiogroup pattern + Direct number keys 1-4)
  const handleThemeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setSettingsOpen(false);
      soundEffects.playSelect();
      return;
    }
    e.stopPropagation();
    const currentIndex = themes.findIndex((t) => t.id === theme);
    let nextIndex = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % themes.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + themes.length) % themes.length;
    } else if (e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      nextIndex = parseInt(e.key, 10) - 1;
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const activeEl = document.activeElement;
      const focusedIdx = themeButtonRefs.current.findIndex((el) => el === activeEl);
      nextIndex = focusedIdx >= 0 ? focusedIdx : currentIndex;
    }

    if (nextIndex >= 0 && nextIndex < themes.length) {
      const selected = themes[nextIndex];
      setTheme(selected.id);
      themeButtonRefs.current[nextIndex]?.focus();
      soundEffects.playSelect();
      useAnnouncerStore
        .getState()
        .announce(`Theme changed to ${selected.label}.`, 'assertive', true);
    }
  };

  // Keyboard Navigation for Text Scaling (Arrows, + / -, Home, End, and Numbers 1-5)
  const handleFontKeyDown = (e: React.KeyboardEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setSettingsOpen(false);
      soundEffects.playSelect();
      return;
    }
    e.stopPropagation();
    const currentIndex = fontSizes.indexOf(fontSize);
    let nextIndex = -1;

    if (
      e.key === 'ArrowRight' ||
      e.key === 'ArrowDown' ||
      e.key === '+' ||
      e.key === '=' ||
      e.key === 'Add'
    ) {
      e.preventDefault();
      stepFontSize('increase');
      return;
    } else if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowUp' ||
      e.key === '-' ||
      e.key === '_' ||
      e.key === 'Subtract'
    ) {
      e.preventDefault();
      stepFontSize('decrease');
      return;
    } else if (e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      nextIndex = parseInt(e.key, 10) - 1;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = fontSizes.length - 1;
    }

    if (nextIndex >= 0 && nextIndex < fontSizes.length && nextIndex !== currentIndex) {
      const newScale = fontSizes[nextIndex];
      setFontSize(newScale);
      fontButtonRefs.current[nextIndex]?.focus();
      soundEffects.playSelect();
      useAnnouncerStore
        .getState()
        .announce(`Text scale set to ${newScale} percent.`, 'assertive', true);
    }
  };

  if (!isSettingsOpen) return null;

  const voices = speechEngine.getVoices();

  const handleTestSpeech = () => {
    soundEffects.unlock();
    useAnnouncerStore
      .getState()
      .announce(
        `Testing speech synthesis at rate ${ttsRate.toFixed(1)} and pitch ${ttsPitch.toFixed(1)}. WCAG Level AA compliant.`,
        'assertive',
        true
      );
  };

  const handleTestVoice = (modality: 'hindi' | 'hinglish' | 'english') => {
    soundEffects.unlock();
    let sample = '';
    if (modality === 'english') {
      sample = 'Testing Microsoft Ava Multilingual neural voice. Question reading and English navigation are active.';
    } else if (modality === 'hinglish') {
      sample = 'Testing Microsoft Neerja neural voice. Aapka sawal number ek yahan hai, uttar vikalp chuniye.';
    } else {
      sample = 'दृष्टि एक्स परीक्षा पोर्टल में आपका स्वागत है। मधुर आवाज तैयार है।';
    }
    useAnnouncerStore.getState().announce(sample, 'assertive', true);
  };

  const handleTestEarcon = () => {
    earconManager.unlock();
    earconManager.playMarkReview();
  };

  const handleTestHaptic = () => {
    const ok = hapticManager.vibrateMarkReview();
    if (!ok) {
      useAnnouncerStore
        .getState()
        .announce('Haptic vibration is not supported on this browser or device.', 'polite');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="a11y-settings-title"
      onKeyDown={handleModalKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          setSettingsOpen(false);
          soundEffects.playSelect();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs"
    >
      <div
        ref={modalContainerRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] bg-theme-surface border-2 border-theme-border rounded-2xl shadow-2xl flex flex-col overflow-hidden text-theme-text transition-colors"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b-2 border-theme-border flex justify-between items-center bg-theme-bg">
          <div className="flex items-center gap-2">
            <Sliders className="w-6 h-6 text-yellow-400" aria-hidden="true" />
            <h2 id="a11y-settings-title" className="text-xl font-bold tracking-tight">
              Accessibility Preferences
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onFocusCapture={() => handleSectionFocus('close')}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSettingsOpen(false);
              soundEffects.playSelect();
            }}
            aria-label="Close accessibility settings (Esc)"
            className="p-2 rounded-xl border-2 border-theme-border hover:bg-theme-surface transition focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Helpful Keyboard Instructions Banner */}
        <div
          role="note"
          aria-label="Keyboard Shortcuts"
          className="px-4 py-2.5 bg-yellow-500/10 border-b border-theme-border flex items-center gap-2 text-xs font-semibold text-theme-text"
        >
          <Keyboard className="w-4 h-4 text-yellow-400 shrink-0" aria-hidden="true" />
          <span>
            <strong>Keyboard Navigation:</strong> Use <strong>Tab</strong> to move between sections (or <strong>Alt+1 to 5</strong>),{' '}
            <strong>Arrow keys (← ↑ → ↓)</strong> to pick themes & text size, <strong>Space</strong> to toggle, and{' '}
            <strong>Esc</strong> to close.
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. Dynamic Contrast Theme */}
          <section
            id="a11y-section-1"
            aria-labelledby="theme-heading"
            onFocusCapture={() => handleSectionFocus(1)}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 id="theme-heading" className="text-base font-bold flex items-center gap-2">
                <Sun className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                <span>1. Dynamic Contrast Themes (WCAG 2.1 AA Compliant)</span>
              </h3>
              <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-bg border border-theme-border text-theme-text/70">
                Alt+1
              </kbd>
            </div>
            <p className="text-xs text-theme-text/70 mb-3">
              Use Arrow keys (Left/Right or Up/Down) or keys 1–4 to immediately switch theme.
            </p>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              role="radiogroup"
              aria-label="High Contrast Themes"
              onKeyDown={handleThemeKeyDown}
            >
              {themes.map((t, idx) => {
                const isSelected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    ref={(el) => {
                      themeButtonRefs.current[idx] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onFocus={() => {
                      handleSubcategoryFocus(
                        `theme-${t.id}`,
                        `Sub-category: ${t.label} theme. ${t.desc}. ${isSelected ? 'Currently active.' : 'Press Space to apply.'}`,
                        `सब-कैटेगरी: ${t.label} थीम। ${isSelected ? 'सक्रिय है।' : 'लागू करने के लिए Space दबाएं।'}`,
                        idx === 0
                      );
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTheme(t.id);
                      soundEffects.playSelect();
                      useAnnouncerStore
                        .getState()
                        .announce(`Theme changed to ${t.label}.`, 'assertive', true);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setTheme(t.id);
                        soundEffects.playSelect();
                        useAnnouncerStore
                          .getState()
                          .announce(`Theme changed to ${t.label}.`, 'assertive', true);
                      }
                    }}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all duration-200 flex flex-col gap-2 focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400 cursor-pointer ${
                      isSelected
                        ? 'border-yellow-400 ring-2 ring-yellow-400/50 bg-theme-bg font-bold shadow-lg scale-[1.01]'
                        : 'border-theme-border bg-theme-surface hover:bg-theme-surface-elevated hover:border-theme-primary/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold flex items-center gap-1.5">
                        <span aria-hidden="true">{t.icon}</span>
                        <span>{t.label}</span>
                      </span>
                      {isSelected ? (
                        <span className="text-xs px-2.5 py-0.5 rounded-md bg-yellow-400 text-black font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                          <span>✓</span>
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-md border border-theme-border text-theme-text/60 font-semibold">
                          Click to apply
                        </span>
                      )}
                    </div>

                    {/* Visual Palette Preview Swatch */}
                    <div
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs"
                      style={{
                        backgroundColor: t.preview.bg,
                        borderColor: t.preview.border,
                        color: t.preview.text,
                      }}
                      aria-hidden="true"
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 border"
                        style={{
                          backgroundColor: t.preview.primary,
                          borderColor: t.preview.border,
                        }}
                      />
                      <span className="font-bold truncate">Aa Sample Text</span>
                      <span
                        className="text-[10px] ml-auto px-1.5 py-0.2 rounded font-mono font-bold"
                        style={{
                          backgroundColor: t.preview.primary,
                          color: t.id === 'high-contrast' || t.id === 'dark' ? '#071511' : '#FFFFFF',
                        }}
                      >
                        {t.preview.badge}
                      </span>
                    </div>

                    <span className="text-xs text-theme-text/75 leading-snug">
                      {t.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Text Resizing & Font Scaling */}
          <section
            id="a11y-section-2"
            aria-labelledby="text-size-heading"
            className="pt-4 border-t border-theme-border"
            onFocusCapture={() => handleSectionFocus(2)}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 id="text-size-heading" className="text-base font-bold flex items-center gap-2">
                <Type className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                <span>2. Text & UI Scaling (No Horizontal Scroll Overflow)</span>
              </h3>
              <div className="flex items-center gap-2">
                <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-bg border border-theme-border text-theme-text/70">
                  Alt+2
                </kbd>
                <span className="text-sm font-mono font-bold px-2 py-1 rounded-lg bg-theme-bg border-2 border-theme-border">
                  {fontSize}%
                </span>
              </div>
            </div>
            <p className="text-xs text-theme-text/70 mb-3">
              Use Arrow keys (Left/Right), + / - keys, or number keys 1–5 to change magnification.
            </p>

            <div
              className="grid grid-cols-5 gap-2"
              role="radiogroup"
              aria-label="Text scale factor"
              onKeyDown={handleFontKeyDown}
            >
              {fontSizes.map((scale, idx) => {
                const isSelected = fontSize === scale;
                return (
                  <button
                    key={scale}
                    ref={(el) => {
                      fontButtonRefs.current[idx] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${scale} percent magnification (Press ${idx + 1})`}
                    tabIndex={0}
                    onFocus={() => {
                      handleSubcategoryFocus(
                        `scale-${scale}`,
                        `Sub-category: Text magnification ${scale} percent preset. ${isSelected ? 'Currently active.' : 'Press Space to apply.'}`,
                        `सब-कैटेगरी: टेक्स्ट मैग्निफिकेशन ${scale} प्रतिशत। ${isSelected ? 'सक्रिय है।' : 'लागू करने के लिए Space दबाएं।'}`,
                        idx === 0
                      );
                    }}
                    onClick={() => {
                      setFontSize(scale);
                      soundEffects.playSelect();
                      useAnnouncerStore
                        .getState()
                        .announce(`Text scale set to ${scale} percent.`, 'assertive', true);
                    }}
                    onKeyDown={handleFontKeyDown}
                    className={`py-2 px-1 text-center rounded-xl border-2 text-sm sm:text-base font-bold transition focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400 ${
                      isSelected
                        ? 'border-yellow-400 bg-yellow-400 text-black shadow-md'
                        : 'border-theme-border bg-theme-bg text-theme-text hover:bg-theme-surface'
                    }`}
                  >
                    {scale}%
                  </button>
                );
              })}
            </div>

            {/* Dyslexia / Hyper-legible toggle */}
            <div className="mt-4">
              <label className="flex items-center gap-3 p-3.5 rounded-xl border-2 border-theme-border bg-theme-bg cursor-pointer hover:border-yellow-400/60 focus-within:ring-4 focus-within:ring-yellow-400 focus-within:border-yellow-400 transition">
                <input
                  type="checkbox"
                  checked={dyslexicFont}
                  onFocus={() => {
                    handleSubcategoryFocus(
                      'dyslexic-font',
                      `Sub-category: Enhanced Letter Spacing & Line Height for dyslexia and low vision. Currently ${dyslexicFont ? 'Enabled' : 'Disabled'}. Press Space to toggle.`,
                      `सब-कैटेगरी: डिस्लेक्सिया और कम दृष्टि के लिए एन्हांस्ड लेटर स्पेसिंग। वर्तमान में ${dyslexicFont ? 'सक्रिय' : 'निष्क्रिय'}। बदलने के लिए Space दबाएं।`
                    );
                  }}
                  onChange={(e) => {
                    setDyslexicFont(e.target.checked);
                    soundEffects.playSelect();
                    useAnnouncerStore
                      .getState()
                      .announce(
                        e.target.checked
                          ? 'Enhanced spacing and line height enabled.'
                          : 'Enhanced spacing disabled.',
                        'polite'
                      );
                  }}
                  className="w-5 h-5 accent-yellow-400 rounded focus:outline-none"
                />
                <div>
                  <span className="font-bold text-sm sm:text-base block">
                    Enhanced Letter Spacing & Line Height
                  </span>
                  <p className="text-xs text-theme-text/70 mt-0.5">
                    Increases letter spacing (0.05em) and line height (1.8) for low-vision and dyslexic candidates.
                  </p>
                </div>
              </label>
            </div>
          </section>

          {/* 3. Integrated Speech Synthesis (Web Speech API) */}
          <section
            id="a11y-section-3"
            aria-labelledby="speech-heading"
            className="pt-4 border-t border-theme-border"
            onFocusCapture={() => handleSectionFocus(3)}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 id="speech-heading" className="text-base font-bold flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                <span>3. Integrated Speech Synthesis (Web Speech API Engine)</span>
              </h3>
              <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-bg border border-theme-border text-theme-text/70">
                Alt+3
              </kbd>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 p-3.5 rounded-xl border-2 border-theme-border bg-theme-bg cursor-pointer hover:border-yellow-400/60 focus-within:ring-4 focus-within:ring-yellow-400 focus-within:border-yellow-400 transition">
                <input
                  type="checkbox"
                  checked={ttsEnabled}
                  onFocus={() => {
                    handleSubcategoryFocus(
                      'tts-master',
                      `Sub-category: Built-in Text-to-Speech master reader. Internal reader for candidates without screen readers. Currently ${ttsEnabled ? 'Enabled' : 'Disabled'}. Press Space to toggle.`,
                      `सब-कैटेगरी: बिल्ट-इन टेक्स्ट-टू-स्पीच मास्टर रीडर। वर्तमान में ${ttsEnabled ? 'सक्रिय' : 'निष्क्रिय'}। टॉगल करने के लिए Space दबाएं।`,
                      true
                    );
                  }}
                  onChange={(e) => {
                    setTtsEnabled(e.target.checked);
                    soundEffects.playSelect();
                    useAnnouncerStore
                      .getState()
                      .announce(
                        e.target.checked
                          ? 'Built-in Text to Speech enabled.'
                          : 'Built-in Text to Speech disabled.',
                        'polite'
                      );
                  }}
                  className="w-5 h-5 accent-yellow-400 rounded focus:outline-none"
                />
                <div>
                  <span className="font-bold text-sm sm:text-base block">
                    Enable Built-in Text-to-Speech (TTS)
                  </span>
                  <p className="text-xs text-theme-text/70 mt-0.5">
                    Internal reader for users without external screen readers (JAWS/NVDA).
                  </p>
                </div>
              </label>

              {ttsEnabled && (
                <div className="p-4 rounded-xl border-2 border-theme-border bg-theme-bg space-y-4">
                  {/* Auto Read on Navigate */}
                  <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-theme-surface focus-within:ring-4 focus-within:ring-yellow-400">
                    <input
                      type="checkbox"
                      checked={autoReadOnNavigate}
                      onFocus={() => {
                        handleSubcategoryFocus(
                          'auto-read',
                          `Sub-category: Automatically read questions on navigate. Currently ${autoReadOnNavigate ? 'Enabled' : 'Disabled'}. Press Space to toggle.`,
                          `सब-कैटेगरी: ऑटो-रीड ऑन नेविगेट। प्रश्न बदलते ही स्वतः वाचन। वर्तमान में ${autoReadOnNavigate ? 'सक्रिय' : 'निष्क्रिय'}। टॉगल करने के लिए Space दबाएं।`
                        );
                      }}
                      onChange={(e) => {
                        setAutoReadOnNavigate(e.target.checked);
                        soundEffects.playSelect();
                      }}
                      className="w-5 h-5 accent-yellow-400 rounded focus:outline-none"
                    />
                    <span className="text-sm font-semibold">
                      Automatically read question upon navigating (Next/Previous)
                    </span>
                  </label>

                  {/* Speech Rate Slider */}
                  <div>
                    <div className="flex justify-between text-xs sm:text-sm font-bold mb-1">
                      <label htmlFor="tts-rate-slider">Speech Rate: {ttsRate.toFixed(1)}x</label>
                      <span className="text-theme-text/70">Range: 0.5x - 2.5x (Use Arrow keys)</span>
                    </div>
                    <input
                      id="tts-rate-slider"
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.1"
                      value={ttsRate}
                      onFocus={() => {
                        handleSubcategoryFocus(
                          'tts-rate',
                          `Sub-category: Speech Rate slider. Currently set to ${ttsRate.toFixed(1)}x speed. Use Left and Right arrow keys to adjust between 0.5x and 2.5x.`,
                          `सब-कैटेगरी: स्पीच गति स्लाइडर। वर्तमान में ${ttsRate.toFixed(1)}x गति। बदलने के लिए लेफ्ट और राइट एरो कीज़ दबाएं।`
                        );
                      }}
                      onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                      className="w-full accent-yellow-400 cursor-pointer focus:outline-none focus:ring-4 focus:ring-yellow-400 rounded"
                    />
                  </div>

                  {/* Speech Pitch Slider */}
                  <div>
                    <div className="flex justify-between text-xs sm:text-sm font-bold mb-1">
                      <label htmlFor="tts-pitch-slider">Voice Pitch: {ttsPitch.toFixed(1)}</label>
                      <span className="text-theme-text/70">Range: 0.5 - 1.5 (Use Arrow keys)</span>
                    </div>
                    <input
                      id="tts-pitch-slider"
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.1"
                      value={ttsPitch}
                      onFocus={() => {
                        handleSubcategoryFocus(
                          'tts-pitch',
                          `Sub-category: Voice Pitch slider. Currently set to ${ttsPitch.toFixed(1)}. Use Left and Right arrow keys to adjust between 0.5 and 1.5.`,
                          `सब-कैटेगरी: वॉइस पिच स्लाइडर। वर्तमान में ${ttsPitch.toFixed(1)}। बदलने के लिए लेफ्ट और राइट एरो कीज़ दबाएं।`
                        );
                      }}
                      onChange={(e) => setTtsPitch(parseFloat(e.target.value))}
                      className="w-full accent-yellow-400 cursor-pointer focus:outline-none focus:ring-4 focus:ring-yellow-400 rounded"
                    />
                  </div>

                  {/* Voice Selector */}
                  <div>
                    <label htmlFor="tts-voice-select" className="block text-xs sm:text-sm font-bold mb-1">
                      Select Speech Voice Engine:
                    </label>
                    <select
                      id="tts-voice-select"
                      aria-label="Select Speech Voice Engine"
                      title="Select Speech Voice Engine"
                      value={ttsVoice}
                      onFocus={() => {
                        handleSubcategoryFocus(
                          'tts-voice',
                          `Sub-category: Speech voice engine selector. Currently set to ${ttsVoice || 'Microsoft Edge Neural TTS'}. Use Up and Down arrow keys to change voice.`,
                          `सब-कैटेगरी: स्पीच वॉइस इंजन चयन। वर्तमान में ${ttsVoice || 'माइक्रोसॉफ्ट एज न्यूरल वॉइस'}। बदलने के लिए अप और डाउन एरो कीज़ दबाएं।`
                        );
                      }}
                      onChange={(e) => setTtsVoice(e.target.value)}
                      className="w-full p-2.5 rounded-xl border-2 border-theme-border bg-theme-surface text-theme-text font-medium text-sm focus:outline-none focus:ring-4 focus:ring-yellow-400"
                    >
                      <option value="">⚡ Default: Microsoft Edge Neural TTS (Auto: Madhur / Neerja / Ava)</option>
                      <optgroup label="Microsoft Edge Neural Voices (Recommended)">
                        <option value={EDGE_TTS_VOICES.HINDI}>Hindi (Devanagari): {EDGE_TTS_VOICES.HINDI}</option>
                        <option value={EDGE_TTS_VOICES.HINGLISH}>Hinglish (Roman Hindi): {EDGE_TTS_VOICES.HINGLISH}</option>
                        <option value={EDGE_TTS_VOICES.ENGLISH}>English (Default): {EDGE_TTS_VOICES.ENGLISH}</option>
                      </optgroup>
                      {voices.length > 0 && (
                        <optgroup label="Installed Browser & System Voices">
                          {voices.map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                              {v.name} ({v.lang})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    {/* Edge Neural TTS Active Profile Card */}
                    <div className="mt-2.5 p-3 rounded-xl border border-yellow-400/30 bg-yellow-400/5 text-xs text-theme-text space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Microsoft Edge Neural TTS Profile (Default Active)</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold uppercase tracking-wider">
                          Active
                        </span>
                      </div>
                      <p className="text-[11px] text-theme-muted">
                        DristiX automatically routes speech to the optimal Microsoft Edge Natural neural voice based on language and script:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                        <div className="p-2 rounded-lg bg-theme-surface border border-theme-border flex flex-col justify-between">
                          <div>
                            <div className="text-theme-muted font-sans font-medium text-[10px]">Hindi (Devanagari)</div>
                            <div className="font-bold text-amber-700 dark:text-amber-400 truncate">{EDGE_TTS_VOICES.HINDI}</div>
                          </div>
                          <button
                            type="button"
                            onFocus={() => {
                              handleSubcategoryFocus(
                                'test-voice-hindi',
                                'Sub-category: Test Hindi Devanagari voice with Microsoft Madhur neural voice. Press Enter to listen.',
                                'सब-कैटेगरी: टेस्ट हिंदी वॉइस। माइक्रोसॉफ्ट मधुर आवाज़ सुनने के लिए Enter दबाएं।'
                              );
                            }}
                            onClick={() => handleTestVoice('hindi')}
                            className="mt-2 text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 text-left focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded"
                          >
                            <Volume2 className="w-3 h-3 inline" aria-hidden="true" />
                            <span>Test Hindi</span>
                          </button>
                        </div>
                        <div className="p-2 rounded-lg bg-theme-surface border border-theme-border flex flex-col justify-between">
                          <div>
                            <div className="text-theme-muted font-sans font-medium text-[10px]">Hinglish (Roman Hindi)</div>
                            <div className="font-bold text-amber-700 dark:text-amber-400 truncate">{EDGE_TTS_VOICES.HINGLISH}</div>
                          </div>
                          <button
                            type="button"
                            onFocus={() => {
                              handleSubcategoryFocus(
                                'test-voice-hinglish',
                                'Sub-category: Test Hinglish Roman Hindi voice with Microsoft Neerja neural voice. Press Enter to listen.',
                                'सब-कैटेगरी: टेस्ट हिंग्लिश वॉइस। माइक्रोसॉफ्ट नीरजा आवाज़ सुनने के लिए Enter दबाएं।'
                              );
                            }}
                            onClick={() => handleTestVoice('hinglish')}
                            className="mt-2 text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 text-left focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded"
                          >
                            <Volume2 className="w-3 h-3 inline" aria-hidden="true" />
                            <span>Test Hinglish</span>
                          </button>
                        </div>
                        <div className="p-2 rounded-lg bg-theme-surface border border-theme-border flex flex-col justify-between">
                          <div>
                            <div className="text-theme-muted font-sans font-medium text-[10px]">English (Default)</div>
                            <div className="font-bold text-amber-700 dark:text-amber-400 truncate">{EDGE_TTS_VOICES.ENGLISH}</div>
                          </div>
                          <button
                            type="button"
                            onFocus={() => {
                              handleSubcategoryFocus(
                                'test-voice-english',
                                'Sub-category: Test English voice with Microsoft Ava neural voice. Press Enter to listen.',
                                'सब-कैटेगरी: टेस्ट अंग्रेज़ी वॉइस। माइक्रोसॉफ्ट आवा आवाज़ सुनने के लिए Enter दबाएं।'
                              );
                            }}
                            onClick={() => handleTestVoice('english')}
                            className="mt-2 text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 text-left focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded"
                          >
                            <Volume2 className="w-3 h-3 inline" aria-hidden="true" />
                            <span>Test English</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-start">
                    <button
                      type="button"
                      onFocus={() => {
                        handleSubcategoryFocus(
                          'test-speech-output',
                          'Sub-category: Test Speech Output button. Tests current speech rate, pitch, and voice settings. Press Enter to play.',
                          'सब-कैटेगरी: टेस्ट स्पीच आउटपुट बटन। वर्तमान सेटिंग्स की जांच के लिए Enter दबाएं।'
                        );
                      }}
                      onClick={handleTestSpeech}
                      className="px-4 py-2 font-bold rounded-xl border-2 border-theme-border bg-theme-surface hover:bg-theme-bg text-theme-text text-sm flex items-center gap-1.5 focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400"
                    >
                      <Volume2 className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                      <span>Test Speech Output</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 4. Multi-Sensory Feedback (Audio, Earcons & Haptics) */}
          <section
            id="a11y-section-4"
            aria-labelledby="sound-heading"
            className="pt-4 border-t border-theme-border"
            onFocusCapture={() => handleSectionFocus(4)}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 id="sound-heading" className="text-base font-bold flex items-center gap-2">
                <Bell className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                <span>4. Multi-Sensory Accessibility Core (Earcons, Staging & Haptics)</span>
              </h3>
              <div className="flex items-center gap-2">
                <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-bg border border-theme-border text-theme-text/70">
                  Alt+4
                </kbd>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-bold">
                  Acoustic Engine Active
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {/* 4A. Master Audio Feedback Toggle */}
              <div className="p-3.5 rounded-xl border-2 border-theme-border bg-theme-bg">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={audioFeedbackEnabled}
                      onFocus={() => {
                        handleSubcategoryFocus(
                          'master-audio',
                          `Sub-category: Master Audio Feedback toggle. Controls all application-wide speech, auditory earcons, and system audio alerts. Currently ${audioFeedbackEnabled ? 'ON' : 'OFF'}. Press Space to toggle.`,
                          `सब-कैटेगरी: मास्टर ऑडियो फीडबैक। सभी आवाज़, इयरकॉन्स और सिस्टम अलर्ट्स को नियंत्रित करता है। वर्तमान में ${audioFeedbackEnabled ? 'चालू' : 'बंद'}। टॉगल करने के लिए Space दबाएं।`,
                          true
                        );
                      }}
                      onChange={(e) => {
                        setAudioFeedbackEnabled(e.target.checked);
                        earconManager.playOptionSelected();
                      }}
                      className="w-5 h-5 accent-yellow-400 rounded focus:outline-none"
                    />
                    <div>
                      <span className="font-bold text-sm sm:text-base block">Master Audio Feedback</span>
                      <p className="text-xs text-theme-text/70 mt-0.5">
                        Controls all application-wide speech, auditory earcons, and system audio alerts.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border border-theme-border text-theme-text/80">
                    {audioFeedbackEnabled ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>

              {/* 4B. Earcons (Non-Speech Auditory Tones) */}
              <div className="p-3.5 rounded-xl border-2 border-theme-border bg-theme-bg flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-[240px]">
                  <input
                    type="checkbox"
                    checked={earconsEnabled}
                    onFocus={() => {
                      handleSubcategoryFocus(
                        'earcons-toggle',
                        `Sub-category: Non-Speech Auditory Cues Earcons. Harmonic frequency tones for option selection, review marking, and timer alerts. Currently ${earconsEnabled ? 'ON' : 'OFF'}. Press Space to toggle.`,
                        `सब-कैटेगरी: नॉन-स्पीच हार्मोनिक इयरकॉन्स। विकल्प चयन और टाइमर अलर्ट के लिए टोन बजाता है। वर्तमान में ${earconsEnabled ? 'चालू' : 'बंद'}। टॉगल करने के लिए Space दबाएं।`
                      );
                    }}
                    onChange={(e) => {
                      setEarconsEnabled(e.target.checked);
                      earconManager.playOptionSelected();
                    }}
                    className="w-5 h-5 accent-yellow-400 rounded focus:outline-none"
                  />
                  <div>
                    <span className="font-bold text-sm sm:text-base block">Non-Speech Auditory Cues (Earcons)</span>
                    <p className="text-xs text-theme-text/70 mt-0.5">
                      Harmonic frequency tones for option selection, review marking, timer alerts, and navigation.
                    </p>
                  </div>
                </label>

                {earconsEnabled && (
                  <button
                    type="button"
                    onFocus={() => {
                      handleSubcategoryFocus(
                        'test-earcon',
                        'Sub-category: Play Sample Earcon button. Plays a harmonic chime used for review marking. Press Enter or Space to play.',
                        'सब-कैटेगरी: सैंपल इयरकॉन बजाएं बटन। सुनने के लिए Enter दबाएं।'
                      );
                    }}
                    onClick={handleTestEarcon}
                    className="px-3 py-1.5 font-bold rounded-lg border-2 border-theme-border bg-theme-surface hover:bg-theme-bg text-theme-text text-xs focus:outline-none focus:ring-4 focus:ring-yellow-400 shrink-0"
                  >
                    Play Sample Earcon
                  </button>
                )}
              </div>

              {/* 4C. Acoustic Staging (Cognitive Separation) */}
              <div className="p-3.5 rounded-xl border-2 border-theme-border bg-theme-bg">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acousticStagingEnabled}
                    onFocus={() => {
                      handleSubcategoryFocus(
                        'acoustic-staging',
                        `Sub-category: Acoustic Staging cognitive differentiation. Differentiates speech cadence and timbre between questions, options, and alerts to eliminate auditory fatigue. Currently ${acousticStagingEnabled ? 'ON' : 'OFF'}. Press Space to toggle.`,
                        `सब-कैटेगरी: अकौस्टिक स्टेजिंग। सुनने की थकान कम करने के लिए प्रश्नों और विकल्पों की आवाज़ की लय अलग करता है। वर्तमान में ${acousticStagingEnabled ? 'चालू' : 'बंद'}।`
                      );
                    }}
                    onChange={(e) => {
                      setAcousticStagingEnabled(e.target.checked);
                      earconManager.playOptionSelected();
                    }}
                    className="w-5 h-5 accent-yellow-400 rounded focus:outline-none"
                  />
                  <div>
                    <span className="font-bold text-sm sm:text-base block">Acoustic Staging (Cognitive Differentiation)</span>
                    <p className="text-xs text-theme-text/70 mt-0.5">
                      Differentiates speech cadence and timbre between questions, options, warnings, and success feedback to eliminate auditory fatigue.
                    </p>
                  </div>
                </label>
              </div>

              {/* 4D. Haptic Feedback (Vibration API) */}
              <div className="p-3.5 rounded-xl border-2 border-theme-border bg-theme-bg flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-[240px]">
                  <input
                    type="checkbox"
                    checked={hapticEnabled}
                    onFocus={() => {
                      handleSubcategoryFocus(
                        'haptic-feedback',
                        `Sub-category: Haptic Vibration Feedback. Delivers tactile micro-vibrations for silent option selection and countdown alerts. Currently ${hapticEnabled ? 'ON' : 'OFF'}. Press Space to toggle.`,
                        `सब-कैटेगरी: हैप्टिक वाइब्रेशन फीडबैक। शांत विकल्प चयन के लिए सूक्ष्म कंपन। वर्तमान में ${hapticEnabled ? 'चालू' : 'बंद'}।`
                      );
                    }}
                    onChange={(e) => {
                      setHapticEnabled(e.target.checked);
                      hapticManager.vibrateOptionSelected();
                    }}
                    className="w-5 h-5 accent-yellow-400 rounded focus:outline-none"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm sm:text-base">Haptic Vibration Feedback</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          hapticManager.isSupported()
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                        }`}
                      >
                        {hapticManager.isSupported() ? 'Device Supported' : 'Hardware Fallback'}
                      </span>
                    </div>
                    <p className="text-xs text-theme-text/70 mt-0.5">
                      Tactile micro-vibrations for silent option selection, marking review, and critical countdown.
                    </p>
                  </div>
                </label>

                {hapticEnabled && hapticManager.isSupported() && (
                  <button
                    type="button"
                    onFocus={() => {
                      handleSubcategoryFocus(
                        'test-haptic',
                        'Sub-category: Test Vibration button. Triggers a sample tactile vibration pulse. Press Enter or Space to test.',
                        'सब-कैटेगरी: टेस्ट वाइब्रेशन बटन। कंपन की जांच के लिए Enter दबाएं।'
                      );
                    }}
                    onClick={handleTestHaptic}
                    className="px-3 py-1.5 font-bold rounded-lg border-2 border-theme-border bg-theme-surface hover:bg-theme-bg text-theme-text text-xs focus:outline-none focus:ring-4 focus:ring-yellow-400 shrink-0"
                  >
                    Test Vibration
                  </button>
                )}
              </div>

              {/* 4E. Developer A11y Event Logger Mode */}
              <div className="p-3.5 rounded-xl border-2 border-theme-border bg-theme-bg">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a11yDebugMode}
                    onFocus={() => {
                      handleSubcategoryFocus(
                        'a11y-debug',
                        `Sub-category: Accessibility Event Logger. Outputs real-time speech, earcon, and haptic event dispatches to browser developer console. Currently ${a11yDebugMode ? 'ON' : 'OFF'}. Press Space to toggle.`,
                        `सब-कैटेगरी: एक्सेसिबिलिटी इवेंट लॉगर। कंसोल में इवेंट्स रिकॉर्ड करता है। वर्तमान में ${a11yDebugMode ? 'चालू' : 'बंद'}।`
                      );
                    }}
                    onChange={(e) => {
                      setA11yDebugMode(e.target.checked);
                      earconManager.playOptionSelected();
                    }}
                    className="w-5 h-5 accent-yellow-400 rounded focus:outline-none"
                  />
                  <div>
                    <span className="font-bold text-sm sm:text-base flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Accessibility Event Logger (Dev Inspection)</span>
                    </span>
                    <p className="text-xs text-theme-text/70 mt-0.5">
                      Outputs real-time accessibility event dispatches (speech, earcon, and haptic channel logs) to the browser developer console.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </section>

          {/* 5. AI Dual Engine (Google Gemini + Groq LLaMA) */}
          <section
            id="a11y-section-5"
            aria-labelledby="ai-heading"
            className="pt-4 border-t border-theme-border"
            onFocusCapture={() => handleSectionFocus(5)}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 id="ai-heading" className="text-base font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                <span>5. AI Dual Engine (Google Gemini + Groq LLaMA)</span>
              </h3>
              <div className="flex items-center gap-2">
                <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-bg border border-theme-border text-theme-text/70">
                  Alt+5
                </kbd>
                <div className="flex items-center gap-1.5">
                  {geminiVoiceService.getApiKey() && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold">
                      Gemini 1st
                    </span>
                  )}
                  {geminiVoiceService.getGroqApiKey() && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-teal-700 dark:text-cyan-300 border border-cyan-500/30 font-bold">
                      ⚡ Groq Active Fallback
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border-2 border-theme-border bg-theme-bg space-y-4">
              <p className="text-xs text-theme-text/80 leading-relaxed">
                DristiX uses a resilient Dual-Engine architecture: it queries <strong>Google Gemini</strong> first. If Google API is slow, rate-limited, or fails, it instantaneously fails over to ultra-high-speed <strong>Groq LLaMA 3.3</strong>.
              </p>

              {/* Gemini Key Input */}
              <div className="space-y-1">
                <label htmlFor="gemini-key-input" className="text-[11px] font-bold text-theme-text/70">
                  Primary: Google Gemini API Key
                </label>
                <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                  <div className="relative flex-1">
                    <Key className="w-4 h-4 text-theme-text/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      defaultValue={geminiVoiceService.getApiKey()}
                      placeholder="Enter Google AI Studio Gemini API Key..."
                      id="gemini-key-input"
                      onFocus={() => {
                        handleSubcategoryFocus(
                          'gemini-key',
                          'Sub-category: Primary Google Gemini API Key password field. Type or paste your Google AI Studio Gemini key here for AI reasoning and explanations.',
                          'सब-कैटेगरी: प्राइमरी गूगल जेमिनी एपीआई की पासवर्ड फ़ील्ड। जेमिनी की यहाँ दर्ज करें।',
                          true
                        );
                      }}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border-2 border-theme-border bg-theme-surface text-theme-text text-xs focus:outline-none focus:ring-4 focus:ring-yellow-400 font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onFocus={() => {
                      handleSubcategoryFocus(
                        'save-gemini',
                        'Sub-category: Save Google Gemini Key button. Saves and verifies your Gemini API key preference. Press Enter or Space to save.',
                        'सब-कैटेगरी: सेव गूगल जेमिनी की बटन। सहेजने के लिए Enter दबाएं।'
                      );
                    }}
                    onClick={() => {
                      const el = document.getElementById('gemini-key-input') as HTMLInputElement;
                      if (el) {
                        geminiVoiceService.setApiKey(el.value);
                        soundEffects.playSelect();
                        useAnnouncerStore
                          .getState()
                          .announce('Gemini API Key preference updated.', 'assertive', true);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-theme-primary text-theme-primary-text font-bold text-xs hover:bg-theme-primary-hover transition shrink-0 focus:outline-none focus:ring-4 focus:ring-yellow-400"
                  >
                    Save Gemini
                  </button>
                </div>
              </div>

              {/* Groq Key Input */}
              <div className="space-y-1">
                <label htmlFor="groq-key-input" className="text-[11px] font-bold text-theme-text/70 flex items-center justify-between">
                  <span>Failover: Groq Cloud API Key (Pre-configured)</span>
                  <span className="text-[10px] text-teal-700 dark:text-cyan-300 font-normal">Lightning-fast 500 T/s</span>
                </label>
                <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                  <div className="relative flex-1">
                    <Key className="w-4 h-4 text-theme-text/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      defaultValue={geminiVoiceService.getGroqApiKey()}
                      placeholder="Enter Groq API Key (gsk_...)"
                      id="groq-key-input"
                      onFocus={() => {
                        handleSubcategoryFocus(
                          'groq-key',
                          'Sub-category: Failover Groq Cloud API Key password field. Pre-configured for ultra-fast 500 tokens per second resilient failover if Gemini is slow.',
                          'सब-कैटेगरी: फ़ेलओवर ग्रोक क्लाउड एपीआई की फ़ील्ड। 500 टोकन प्रति सेकंड बैकअप।'
                        );
                      }}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border-2 border-theme-border bg-theme-surface text-theme-text text-xs focus:outline-none focus:ring-4 focus:ring-yellow-400 font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onFocus={() => {
                      handleSubcategoryFocus(
                        'save-groq',
                        'Sub-category: Save Groq Failover Key button. Saves your Groq Cloud failover preference. Press Enter or Space to save.',
                        'सब-कैटेगरी: सेव ग्रोक फ़ेलओवर की बटन। सहेजने के लिए Enter दबाएं।'
                      );
                    }}
                    onClick={() => {
                      const el = document.getElementById('groq-key-input') as HTMLInputElement;
                      if (el) {
                        geminiVoiceService.setGroqApiKey(el.value);
                        soundEffects.playSelect();
                        useAnnouncerStore
                          .getState()
                          .announce('Groq Failover API Key saved.', 'assertive', true);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-theme-primary text-theme-primary-text font-bold text-xs hover:bg-theme-primary-hover transition shrink-0 focus:outline-none focus:ring-4 focus:ring-yellow-400"
                  >
                    Save Groq
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t-2 border-theme-border bg-theme-bg flex justify-end">
          <button
            ref={doneButtonRef}
            type="button"
            onFocusCapture={() => handleSectionFocus('done')}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSettingsOpen(false);
              soundEffects.playSelect();
            }}
            className="px-6 py-2.5 font-bold rounded-xl border-2 border-theme-border bg-theme-primary text-theme-primary-text hover:bg-theme-primary-hover shadow-md focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400"
          >
            Done & Save Preferences (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
