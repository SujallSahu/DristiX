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
  const isInitialOpenRef = useRef<boolean>(false);
  const suppressSectionAnnounceRef = useRef<boolean>(false);

  const handleSectionFocus = (sectionId: SectionIdentifier) => {
    if (isInitialOpenRef.current || suppressSectionAnnounceRef.current) return;
    if (currentFocusedSectionRef.current === sectionId) return;

    currentFocusedSectionRef.current = sectionId;
    soundEffects.playNavigate();

    const inHindi = isHindiPreferred();
    let announcement = '';

    switch (sectionId) {
      case 1:
        announcement = inHindi
          ? 'सेक्शन 1: डायनामिक कंट्रास्ट थीम्स। थीम बदलने के लिए एरो कीज़ या 1 से 4 नंबर दबाएं।'
          : 'Shifted to Section 1: Dynamic Contrast Themes. Use arrow keys or numbers 1 to 4 to switch themes.';
        break;
      case 2:
        announcement = inHindi
          ? 'सेक्शन 2: टेक्स्ट और यूआई स्केलिंग। मैग्निफिकेशन बदलने के लिए एरो कीज़ या 1 से 5 नंबर दबाएं।'
          : 'Shifted to Section 2: Text & UI Scaling. Use arrow keys or numbers 1 to 5 to change magnification.';
        break;
      case 3:
        announcement = inHindi
          ? 'सेक्शन 3: इंटीग्रेटेड स्पीच सिंथेसिस। आवाज़ की गति, पिच और स्पीच इंजन कॉन्फ़िगर करें।'
          : 'Shifted to Section 3: Integrated Speech Synthesis. Configure speech rate, pitch, and voice engine.';
        break;
      case 4:
        announcement = inHindi
          ? 'सेक्शन 4: मल्टी-सेंसरी एक्सेसिबिलिटी कोर। इयरकॉन्स, अकौस्टिक स्टेजिंग और हैप्टिक्स टॉगल करें।'
          : 'Shifted to Section 4: Multi-Sensory Accessibility Core. Toggle earcons, acoustic staging, and haptics.';
        break;
      case 5:
        announcement = inHindi
          ? 'सेक्शन 5: एआई डुअल इंजन। गूगल जेमिनी और ग्रोक एललामा एपीआई कीज़ कॉन्फ़िगर करें।'
          : 'Shifted to Section 5: AI Dual Engine. Configure Google Gemini and Groq LLaMA API keys.';
        break;
      case 'done':
        announcement = inHindi
          ? 'डन और सेव प्रेफरेंसेस बटन। सहेजने और बंद करने के लिए Enter दबाएं।'
          : 'Shifted to Done and Save Preferences button. Press Enter to save and close.';
        break;
      case 'close':
        announcement = inHindi
          ? 'क्लोज़ सेटिंग्स बटन। बंद करने के लिए Enter दबाएं।'
          : 'Shifted to Close Accessibility Settings button. Press Enter to close.';
        break;
    }

    if (announcement) {
      useAnnouncerStore.getState().announce(announcement, 'assertive', true, true);
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
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs"
    >
      <div
        ref={modalContainerRef}
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
            onClick={() => setSettingsOpen(false)}
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
                    onClick={() => {
                      setTheme(t.id);
                      soundEffects.playSelect();
                      useAnnouncerStore
                        .getState()
                        .announce(`Theme changed to ${t.label}.`, 'assertive', true);
                    }}
                    onKeyDown={(e) => {
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
                          color: t.id === 'high-contrast' ? '#000000' : '#FFFFFF',
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
                      value={ttsVoice}
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
                        <div className="font-bold flex items-center gap-1.5 text-yellow-400">
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Microsoft Edge Neural TTS Profile (Default Active)</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 font-semibold uppercase tracking-wider">
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
                            <div className="font-bold text-yellow-400 truncate">{EDGE_TTS_VOICES.HINDI}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleTestVoice('hindi')}
                            className="mt-2 text-[10px] font-sans font-semibold text-yellow-400 hover:underline flex items-center gap-1 text-left focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded"
                          >
                            <Volume2 className="w-3 h-3 inline" aria-hidden="true" />
                            <span>Test Hindi</span>
                          </button>
                        </div>
                        <div className="p-2 rounded-lg bg-theme-surface border border-theme-border flex flex-col justify-between">
                          <div>
                            <div className="text-theme-muted font-sans font-medium text-[10px]">Hinglish (Roman Hindi)</div>
                            <div className="font-bold text-yellow-400 truncate">{EDGE_TTS_VOICES.HINGLISH}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleTestVoice('hinglish')}
                            className="mt-2 text-[10px] font-sans font-semibold text-yellow-400 hover:underline flex items-center gap-1 text-left focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded"
                          >
                            <Volume2 className="w-3 h-3 inline" aria-hidden="true" />
                            <span>Test Hinglish</span>
                          </button>
                        </div>
                        <div className="p-2 rounded-lg bg-theme-surface border border-theme-border flex flex-col justify-between">
                          <div>
                            <div className="text-theme-muted font-sans font-medium text-[10px]">English (Default)</div>
                            <div className="font-bold text-yellow-400 truncate">{EDGE_TTS_VOICES.ENGLISH}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleTestVoice('english')}
                            className="mt-2 text-[10px] font-sans font-semibold text-yellow-400 hover:underline flex items-center gap-1 text-left focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded"
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
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 font-bold">
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
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
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
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                      Gemini 1st
                    </span>
                  )}
                  {geminiVoiceService.getGroqApiKey() && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold">
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
                      className="w-full pl-9 pr-3 py-2 rounded-xl border-2 border-theme-border bg-theme-surface text-theme-text text-xs focus:outline-none focus:ring-4 focus:ring-yellow-400 font-mono"
                    />
                  </div>
                  <button
                    type="button"
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
                  <span className="text-[10px] text-cyan-400 font-normal">Lightning-fast 500 T/s</span>
                </label>
                <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                  <div className="relative flex-1">
                    <Key className="w-4 h-4 text-theme-text/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      defaultValue={geminiVoiceService.getGroqApiKey()}
                      placeholder="Enter Groq API Key (gsk_...)"
                      id="groq-key-input"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border-2 border-theme-border bg-theme-surface text-theme-text text-xs focus:outline-none focus:ring-4 focus:ring-yellow-400 font-mono"
                    />
                  </div>
                  <button
                    type="button"
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
            onClick={() => {
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
