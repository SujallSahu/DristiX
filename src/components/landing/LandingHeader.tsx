import React, { useEffect, useState } from 'react';
import {
  Volume2, VolumeX, Contrast, Type, Settings, LogIn, UserPlus,
  Menu, X, Home, Zap, Mic, Star, BarChart3, BadgeCheck, HelpCircle, ChevronRight,
} from 'lucide-react';
import {
  usePreferencesStore,
  type ThemeMode,
  type TextScale,
} from '../../store/usePreferencesStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { useExamStore } from '../../store/useExamStore';
import { soundEffects } from '../../utils/soundEffects';
import { speechEngine } from '../../utils/speechEngine';

interface LandingHeaderProps {
  onSignIn: () => void;
  onRegister: () => void;
}

const NAV_ITEMS = [
  { label: 'Home', href: '#top' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Demo', href: '#voice-demo' },
  { label: 'Exams', href: '#exams' },
  { label: 'Why DristiX', href: '#why' },
  { label: 'FAQ', href: '#faq' },
] as const;

const MOBILE_NAV_ITEMS = [
  { label: 'Home', href: '#top', icon: Home, desc: 'Top of page' },
  { label: 'Features', href: '#features', icon: Zap, desc: 'Accessibility highlights' },
  { label: 'How It Works', href: '#how-it-works', icon: Zap, desc: '4-step exam journey' },
  { label: 'Voice Assistant Demo', href: '#voice-demo', icon: Mic, desc: 'Interactive voice controls' },
  { label: 'Exam Catalogue', href: '#exams', icon: Star, desc: 'SSC, Banking, UPSC & more' },
  { label: 'Numbers That Matter', href: '#stats', icon: BarChart3, desc: 'Audited platform metrics' },
  { label: 'Why DristiX', href: '#why', icon: BadgeCheck, desc: 'Screen-reader first design' },
  { label: 'FAQ', href: '#faq', icon: HelpCircle, desc: 'Everything you need to know' },
] as const;

const THEME_ORDER: ThemeMode[] = ['teal-cream', 'liquid-glass', 'dark', 'high-contrast'];
const THEME_NAMES: Record<ThemeMode, string> = {
  'teal-cream':     'Teal & Cream (Light)',
  'liquid-glass':   'Liquid Glass (Frosted Light)',
  'dark':           'Charcoal Dark (Emerald Green)',
  'high-contrast':  'High Contrast (Black & Yellow)',
};

const say = (msg: string) =>
  useAnnouncerStore.getState().announce(msg, 'polite', true);

export const LandingHeader: React.FC<LandingHeaderProps> = ({ onSignIn, onRegister }) => {
  const { theme, setTheme, fontSize, setFontSize, ttsEnabled, setTtsEnabled } =
    usePreferencesStore();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        say('Navigation menu closed.');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const cycleTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    setTheme(next);
    say(`Colour theme: ${THEME_NAMES[next]}.`);
  };

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
      say(`Text size increased to ${next} percent. Tab two times to reset to normal.`);
    } else {
      say('Maximum text size: 200 percent. Tab two times to reset to normal.');
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
    say('Text size returned to normal: 100 percent.');
  };

  const handleTextSizeClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // If second click arrives within 280ms, it is a double tap!
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      handleDoubleTap();
    } else {
      // First click: wait 280ms before firing single tap increase
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        handleSingleTap();
      }, 280);
    }
  };

  const toggleTts = () => {
    // Guard against accidental clicks on Volume button during rapid double-tapping on Text Size button
    if (Date.now() - lastTextSizeChangeTime.current < 600) {
      return;
    }
    const next = !ttsEnabled;
    setTtsEnabled(next);
    useAnnouncerStore.getState().announce(
      next ? 'Spoken output enabled.' : 'Spoken output disabled.',
      'polite',
      next,
    );
  };

  const getIconBtnClass = (isActive: boolean = false) =>
    `h-9 shrink-0 grid place-items-center rounded-xl border transition-all duration-200 active:scale-95 shadow-xs ${
      isActive
        ? 'border-theme-primary bg-theme-primary text-theme-primary-text shadow-md'
        : 'border-theme-border bg-theme-surface text-theme-text hover:border-theme-primary hover:text-theme-primary'
    }`;

  return (
    <header
      role="banner"
      className="sticky top-0 z-50 transition-all duration-300"
      style={{
        background: scrolled
          ? 'color-mix(in srgb, var(--bg-page) 85%, transparent)'
          : 'color-mix(in srgb, var(--bg-page) 60%, transparent)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: scrolled
          ? '1px solid color-mix(in srgb, var(--border-color) 60%, transparent)'
          : '1px solid color-mix(in srgb, var(--border-color) 30%, transparent)',
        boxShadow: scrolled ? '0 4px 32px rgba(0,0,0,0.12)' : 'none',
      }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 lg:gap-3 xl:gap-6">
        {/* Top bar on Mobile / Left on Desktop */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
          {/* Brand */}
          <a href="#top" className="flex items-center gap-2 sm:gap-3 rounded-xl no-underline group shrink-0">
            <div className="relative w-8 h-8 sm:w-9 sm:h-9">
              <div
                className="absolute inset-0 rounded-xl transition-transform group-hover:scale-110"
                style={{ background: 'var(--primary-gradient)', boxShadow: '0 4px 16px var(--primary-glow)' }}
              />
              <span className="absolute inset-0 grid place-items-center text-theme-primary-text font-black text-xs sm:text-sm rounded-xl">
                DX
              </span>
            </div>
            <div>
              <span className="block font-black text-base sm:text-lg text-theme-text tracking-tight leading-tight group-hover:text-theme-primary transition-colors">
                DristiX
              </span>
              <span className="block text-[9px] sm:text-[10px] font-bold text-theme-text-secondary leading-tight tracking-wide uppercase">
                Accessible Exam Portal
              </span>
            </div>
          </a>

          {/* MOBILE-ONLY Top Right: Login, Sign Up, & Menu Toggle */}
          <div className="flex sm:hidden items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              className="h-8 px-2 rounded-lg border border-theme-border bg-theme-surface font-bold text-xs text-theme-text flex items-center gap-1 shadow-xs active:scale-95 cursor-pointer"
              aria-label="Login to candidate portal"
            >
              <LogIn className="w-3.5 h-3.5 text-theme-primary" aria-hidden="true" />
              <span>Login</span>
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="h-8 px-2.5 rounded-lg font-black text-xs text-theme-primary-text flex items-center gap-1 shadow-md active:scale-95 cursor-pointer"
              style={{
                background: 'var(--primary-gradient)',
                boxShadow: '0 2px 10px var(--primary-glow)',
              }}
              aria-label="Register / Sign Up for new account"
            >
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign Up</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !mobileMenuOpen;
                setMobileMenuOpen(next);
                say(next ? 'Navigation menu opened.' : 'Navigation menu closed.');
              }}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-controls="mobile-nav-menu"
              className="w-8 h-8 grid place-items-center rounded-lg border border-theme-border bg-theme-surface text-theme-text hover:border-theme-primary hover:text-theme-primary transition-all active:scale-95 shadow-xs cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4 text-theme-primary" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Nav — desktop */}
        <nav aria-label="Primary navigation" className="hidden lg:block shrink-0">
          <ul className="flex items-center gap-0.5 xl:gap-1 list-none m-0 p-0 shrink-0">
            {NAV_ITEMS.map((item) => (
              <li key={item.href} className="shrink-0">
                <a
                  href={item.href}
                  className="px-2.5 xl:px-4 py-2 rounded-xl text-xs xl:text-sm font-bold text-theme-text-secondary no-underline hover:bg-theme-surface hover:text-theme-primary transition-all duration-150 block whitespace-nowrap"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Right: Accessibility controls + Desktop Auth buttons */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 w-full sm:w-auto pt-1 sm:pt-0 border-t border-theme-border sm:border-t-0" style={{ borderColor: 'color-mix(in srgb, var(--border-color) 40%, transparent)' }}>
          {/* Accessibility controls */}
          <div className="flex items-center justify-between sm:justify-end gap-1.5 w-full sm:w-auto" role="group" aria-label="Accessibility controls">
            <button
              type="button"
              onClick={toggleTts}
              aria-pressed={ttsEnabled}
              aria-label={ttsEnabled ? 'Spoken output on — tap to disable' : 'Spoken output off — tap to enable'}
              title={ttsEnabled ? 'Disable spoken output' : 'Enable spoken output'}
              className={`${getIconBtnClass(ttsEnabled)} w-9`}
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
            >
              {ttsEnabled ? <Volume2 className="w-4 h-4" aria-hidden="true" /> : <VolumeX className="w-4 h-4" aria-hidden="true" />}
            </button>

            <button
              type="button"
              onClick={cycleTheme}
              title={`Theme: ${THEME_NAMES[theme]} — tap to change`}
              aria-label={`Colour theme: ${THEME_NAMES[theme]}. Tap to change.`}
              className={`${getIconBtnClass(false)} w-9`}
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
            >
              <Contrast className="w-4 h-4" aria-hidden="true" />
            </button>

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
              className={`${getIconBtnClass(fontSize > 100)} w-auto flex items-center justify-center px-2`}
              style={{ minWidth: '36px', height: '36px', minHeight: '36px' }}
            >
              <Type className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className={`text-[10px] font-sans font-bold leading-none px-1 py-0.5 rounded border shadow-xs ml-1 ${
                fontSize > 100
                  ? 'border-white/40 bg-white text-slate-900 font-extrabold'
                  : 'border-theme-border bg-theme-bg text-theme-text'
              }`}>
                {fontSize}%
              </span>
            </button>

            <button
              type="button"
              onClick={() => useExamStore.getState().setSettingsOpen(true)}
              title="Full accessibility settings"
              aria-label="Open full accessibility settings"
              className={`${getIconBtnClass(false)} w-9`}
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Desktop Divider */}
          <div className="hidden sm:block w-px h-5 self-center bg-theme-border mx-1 shrink-0" aria-hidden="true" />

          {/* Desktop Auth buttons */}
          <button
            type="button"
            onClick={onSignIn}
            className="h-9 px-3.5 xl:px-4 rounded-xl border border-theme-border bg-theme-surface font-bold text-xs xl:text-sm text-theme-text hover:border-theme-primary hover:text-theme-primary transition-all duration-200 active:scale-95 hidden sm:flex items-center gap-1.5 xl:gap-2 shadow-sm shrink-0 whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            <span>Login</span>
          </button>

          <button
            type="button"
            onClick={onRegister}
            className="h-9 px-4 xl:px-5 rounded-xl font-black text-xs xl:text-sm text-theme-primary-text transition-all duration-200 active:scale-95 hidden sm:flex items-center gap-1.5 xl:gap-2 shadow-md hover:scale-105 shrink-0 whitespace-nowrap"
            style={{
              background: 'var(--primary-gradient)',
              boxShadow: '0 4px 16px var(--primary-glow)',
            }}
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>Sign Up</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown Menu — Full flexibility on mobile view */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-menu"
          className="lg:hidden border-t px-3.5 py-4 space-y-3.5 transition-all duration-300 animate-in slide-in-from-top-2 max-h-[82vh] overflow-y-auto"
          style={{
            background: 'color-mix(in srgb, var(--bg-surface-elevated) 96%, var(--bg-page))',
            borderColor: 'color-mix(in srgb, var(--border-color) 45%, transparent)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 16px 36px rgba(0,0,0,0.18)',
          }}
        >
          <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'color-mix(in srgb, var(--border-color) 30%, transparent)' }}>
            <span className="text-[11px] font-black uppercase tracking-wider text-theme-text-secondary">
              Jump to Section
            </span>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                say('Navigation menu closed.');
              }}
              className="text-xs font-bold text-theme-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          </div>

          <nav aria-label="Mobile navigation">
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 list-none m-0 p-0">
              {MOBILE_NAV_ITEMS.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="p-2.5 rounded-xl border flex items-center justify-between gap-3 no-underline group transition-all duration-150 active:scale-98"
                      style={{
                        background: 'color-mix(in srgb, var(--bg-surface) 60%, transparent)',
                        borderColor: 'color-mix(in srgb, var(--border-color) 30%, transparent)',
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg grid place-items-center text-theme-primary shrink-0 transition-transform group-hover:scale-110"
                          style={{ background: 'color-mix(in srgb, var(--primary) 12%, var(--bg-surface))' }}
                        >
                          <ItemIcon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-xs font-bold text-theme-text group-hover:text-theme-primary transition-colors truncate">
                            {item.label}
                          </span>
                          <span className="block text-[10px] text-theme-text-secondary font-medium truncate">
                            {item.desc}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-theme-text-secondary group-hover:text-theme-primary transition-colors shrink-0" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Quick Portal Action Buttons */}
          <div className="pt-2 border-t flex flex-col gap-2" style={{ borderColor: 'color-mix(in srgb, var(--border-color) 30%, transparent)' }}>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onSignIn();
              }}
              className="w-full h-10 px-4 rounded-xl border border-theme-border bg-theme-surface font-bold text-xs text-theme-text flex items-center justify-center gap-2 shadow-xs active:scale-98 cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-theme-primary" aria-hidden="true" />
              <span>Login to Candidate Account</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onRegister();
              }}
              className="w-full h-10 px-4 rounded-xl font-black text-xs text-theme-primary-text flex items-center justify-center gap-2 shadow-md active:scale-98 cursor-pointer"
              style={{
                background: 'var(--primary-gradient)',
                boxShadow: '0 2px 10px var(--primary-glow)',
              }}
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              <span>Create Free Account / Register</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
