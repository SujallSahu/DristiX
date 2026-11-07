import React, { useEffect, useState, useRef } from 'react';
import {
  BadgeCheck, Ear, Keyboard, Contrast,
  Languages, BarChart3, Volume2, ArrowRight,
  Shield,
} from 'lucide-react';

interface LandingHeroProps {
  onSignIn: () => void;
}

const DEMO_LINES = [
  'Option C selected: 120 degrees. Say "Next question" to continue.',
  'Question 3 of 10. Section: Quantitative Aptitude.',
  '"SSC CGL Tier-1 Comprehensive Mock Test" opened successfully!',
];

const OPTIONS = [
  { key: 'A', text: '60 degrees' },
  { key: 'B', text: '90 degrees' },
  { key: 'C', text: '120 degrees' },
  { key: 'D', text: '180 degrees' },
];

const BADGE_ROWS = [
  [
    { icon: Shield,    label: 'WCAG 2.1 AA',  sub: 'Certified' },
    { icon: Ear,       label: 'Screen Reader', sub: 'Optimized' },
    { icon: Keyboard,  label: 'Keyboard',      sub: 'Complete' },
  ],
  [
    { icon: Contrast,  label: '4 Themes',      sub: 'High Contrast' },
    { icon: Languages, label: 'Hindi + EN',    sub: 'Voice' },
    { icon: BarChart3, label: 'Analytics',     sub: 'Personalized' },
  ],
];

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const LandingHero: React.FC<LandingHeroProps> = ({ onSignIn }) => {
  const [lineIdx, setLineIdx]   = useState(0);
  const [chars,   setChars]     = useState(DEMO_LINES[0].length);
  const cardRef = useRef<HTMLDivElement>(null);

  /* ── Typewriter ── */
  useEffect(() => {
    if (REDUCED_MOTION) return;
    let idx = 0, count = DEMO_LINES[0].length, typing = false, hold = 40;
    const id = window.setInterval(() => {
      if (hold-- > 0) return;
      const len = DEMO_LINES[idx].length;
      if (typing) {
        if (++count >= len) { count = len; typing = false; hold = 48; }
      } else {
        count -= 3;
        if (count <= 0) { count = 0; typing = true; idx = (idx + 1) % DEMO_LINES.length; hold = 10; }
      }
      setLineIdx(idx); setChars(count);
    }, 45);
    return () => clearInterval(id);
  }, []);

  /* ── 3-D card tilt on mouse move ── */
  useEffect(() => {
    const card = cardRef.current;
    if (!card || REDUCED_MOTION) return;
    const onMove = (e: MouseEvent) => {
      const r = card.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  - 0.5) * 10;
      const y = ((e.clientY - r.top)  / r.height - 0.5) * -10;
      card.style.transform = `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateY(-4px)`;
    };
    const onLeave = () => { card.style.transform = ''; };
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
    return () => { card.removeEventListener('mousemove', onMove); card.removeEventListener('mouseleave', onLeave); };
  }, []);

  const visibleLine = DEMO_LINES[lineIdx].slice(0, chars);

  return (
    <section id="top" className="dx-hero-full" aria-label="DristiX hero">
      {/* Ambient orbs */}
      <div className="dx-orb dx-orb-1" aria-hidden="true" />
      <div className="dx-orb dx-orb-2" aria-hidden="true" />
      <div className="dx-orb dx-orb-3" aria-hidden="true" />

      <div className="dx-hero-inner max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 xl:gap-20 items-center pt-6 sm:pt-14 lg:pt-20 pb-16 sm:pb-24 lg:pb-28">

          {/* ══ LEFT: Copy ══ */}
          <div>
            {/* Live badge */}
            <div className="dx-label-pill mb-4 sm:mb-6 dx-rise w-fit">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="dx-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              100% Accessible · WCAG 2.1 AA
            </div>

            {/* Headline — 3 staggered lines with mobile-proportional font scaling */}
            <h1 className="leading-[1.1] sm:leading-[1.02] tracking-[-0.03em] sm:tracking-[-0.045em] dx-rise text-theme-text">
              <span className="block text-3xl sm:text-5xl lg:text-6xl xl:text-7xl font-black">Exam Portal</span>
              <span className="block text-3xl sm:text-5xl lg:text-6xl xl:text-7xl font-black text-theme-text sm:dx-shimmer-text mt-1">That Speaks</span>
              <span className="block text-3xl sm:text-5xl lg:text-6xl xl:text-7xl font-black text-emerald-600 dark:text-emerald-400 sm:dx-gradient-text mt-1">Your Language.</span>
            </h1>

            {/* Sub */}
            <p className="mt-4 sm:mt-7 text-sm sm:text-base lg:text-lg leading-relaxed max-w-[54ch] text-theme-text/85 font-medium dx-rise-delay">
              DristiX delivers mock tests and practice drills built for candidates who are
              blind, low-vision or keyboard-only — and for everyone who wants a faster exam
              experience. Every question reads itself. No mouse ever required.
            </p>

            {/* CTAs */}
            <div className="mt-6 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 dx-rise-delay-2">
              <button
                type="button"
                onClick={onSignIn}
                className="dx-btn-primary h-12 sm:h-14 px-6 sm:px-9 text-sm sm:text-base flex items-center justify-center gap-2.5 sm:gap-3 group shadow-lg"
              >
                <span className="relative z-10 font-black">Start Practicing Free</span>
                <ArrowRight
                  className="relative z-10 w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </button>
              <a
                href="#why"
                className="h-12 sm:h-14 px-5 sm:px-7 rounded-2xl border-2 border-theme-border font-extrabold text-sm sm:text-base text-theme-text hover:border-theme-primary hover:text-theme-primary transition-all duration-200 active:scale-95 inline-flex items-center justify-center no-underline backdrop-blur-sm text-center"
                style={{ background: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)' }}
              >
                See how it works
              </a>
            </div>

            {/* Micro-stats */}
            <div className="mt-6 sm:mt-10 pt-5 sm:pt-8 dx-divider dx-rise-delay-3" />
            <div className="grid grid-cols-3 gap-2 sm:gap-6 mt-5 sm:mt-8 dx-rise-delay-3">
              {[
                { val: '100%', lbl: 'Hands-Free Voice' },
                { val: '4',    lbl: 'Contrast Themes'  },
                { val: '0',    lbl: 'Mouse Needed'      },
              ].map(({ val, lbl }, i) => (
                <div key={lbl} className={i > 0 ? 'border-l border-theme-border/40 pl-2.5 sm:pl-6' : ''}>
                  <div className="text-2xl sm:text-3xl xl:text-4xl font-black dx-gradient-text">{val}</div>
                  <div className="mt-1 text-[11px] sm:text-xs font-bold text-theme-text-secondary leading-tight">{lbl}</div>
                </div>
              ))}
            </div>

            {/* Trust row */}
            <div className="mt-8 flex items-center gap-3 flex-wrap dx-rise-delay-4">
              {['WCAG 2.1 AA', 'axe-core Audited', 'Screen Reader First', 'Open-source'].map((t) => (
                <span key={t}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-surface))',
                    border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
                    color: 'var(--primary)',
                  }}>
                  <BadgeCheck className="w-3 h-3" aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* ══ RIGHT: Live Exam Preview ══ */}
          <div className="flex flex-col gap-3.5">
            {/* Top chips */}
            <ul className="grid grid-cols-3 gap-3 list-none m-0 p-0">
              {BADGE_ROWS[0].map(({ icon: Icon, label, sub }) => (
                <li key={label} className="dx-chip-card rounded-2xl p-3.5 text-center flex flex-col items-center gap-1.5">
                  <div className="w-9 h-9 rounded-xl grid place-items-center mb-1 dx-glow-icon"
                    style={{ background: 'color-mix(in srgb, var(--primary) 15%, var(--bg-surface))' }}>
                    <Icon className="w-4 h-4 text-theme-primary" aria-hidden="true" />
                  </div>
                  <div className="text-[11px] font-black text-theme-text leading-tight">{label}</div>
                  <div className="text-[10px] font-semibold text-theme-text-secondary">{sub}</div>
                </li>
              ))}
            </ul>

            {/* Exam card with 3-D tilt */}
            <div ref={cardRef} className="dx-hero-card rounded-3xl overflow-hidden" style={{ transition: 'transform 0.18s cubic-bezier(0.16,1,0.3,1), box-shadow 0.4s' }}>
              {/* Card top bar */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b"
                style={{
                  background: 'color-mix(in srgb, var(--bg-surface-elevated) 70%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--primary) 20%, transparent)',
                }}>
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="dx-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-xs font-black uppercase tracking-widest text-theme-text/75">SSC-CGL · Mock 01</span>
                </div>
                <span className="px-3 py-1 rounded-xl text-xs font-black tabular-nums"
                  style={{
                    background: 'color-mix(in srgb, var(--bg-page) 60%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--border-color) 50%, transparent)',
                    color: 'var(--text-primary)',
                    backdropFilter: 'blur(8px)',
                  }}>
                  ⏱ 00:42:18
                </span>
              </div>

              {/* Question */}
              <div className="px-5 sm:px-6 pt-5 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-theme-text-secondary">Question 3 of 10</span>
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-black"
                    style={{
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                      color: 'var(--primary)',
                      border: '1px solid color-mix(in srgb, var(--primary) 28%, transparent)',
                    }}>
                    Quantitative Aptitude
                  </span>
                </div>
                <p className="text-[13px] sm:text-sm font-extrabold leading-snug text-theme-text">
                  What is the measure of each interior angle of an equilateral triangle?
                </p>

                <ul className="mt-4 flex flex-col gap-2 list-none m-0 p-0">
                  {OPTIONS.map((opt) => {
                    const sel = opt.key === 'C';
                    return (
                      <li key={opt.key}
                        className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-[13px] transition-all"
                        style={sel ? {
                          background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                          borderColor: 'var(--primary)',
                          fontWeight: 700,
                        } : {
                          background: 'color-mix(in srgb, var(--bg-page) 55%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--border-color) 55%, transparent)',
                          color: 'var(--text-secondary)',
                        }}>
                        <span className={`w-5 h-5 shrink-0 rounded-full grid place-items-center text-[10px] font-black border`}
                          style={sel ? {
                            background: 'var(--primary)',
                            borderColor: 'var(--primary)',
                            color: 'var(--primary-text)',
                            boxShadow: '0 0 8px var(--primary-glow)',
                          } : {
                            background: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--border-color) 70%, transparent)',
                          }}>
                          {sel ? '✓' : ''}
                        </span>
                        <span className="font-black" style={{ color: 'var(--primary)', width: '1.1rem', flexShrink: 0 }}>{opt.key}.</span>
                        <span>{opt.text}</span>
                        {sel && <BadgeCheck className="w-4 h-4 ml-auto text-theme-primary" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Voice strip */}
              <div className="border-t px-5 py-4"
                style={{
                  background: 'color-mix(in srgb, var(--bg-page) 65%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--primary) 18%, transparent)',
                }}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-9 h-9 shrink-0 grid place-items-center rounded-xl text-theme-primary-text shadow-lg"
                    style={{ background: 'var(--primary-gradient)', boxShadow: '0 4px 16px var(--primary-glow)' }}>
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-end gap-[3px] h-4 mb-2" aria-hidden="true">
                      {[6, 12, 5, 14, 8, 13, 4, 15, 7, 11].map((h, i) => (
                        <span key={i} className="dx-bar w-[3px] rounded-full bg-theme-primary"
                          style={{ height: `${h}px`, animationDelay: `${i * 80}ms` }} />
                      ))}
                    </div>
                    <p className="min-h-[2.25rem] text-[13px] font-extrabold leading-snug text-theme-text">
                      {visibleLine}
                      <span aria-hidden="true" className="dx-caret inline-block w-[2px] h-[1em] align-middle bg-theme-primary ml-0.5" />
                    </p>
                    <p className="sr-only">Assistant reads: {DEMO_LINES[0]}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom chips */}
            <ul className="grid grid-cols-3 gap-3 list-none m-0 p-0">
              {BADGE_ROWS[1].map(({ icon: Icon, label, sub }) => (
                <li key={label} className="dx-chip-card rounded-2xl p-3.5 text-center flex flex-col items-center gap-1.5">
                  <div className="w-9 h-9 rounded-xl grid place-items-center mb-1"
                    style={{ background: 'color-mix(in srgb, var(--primary) 15%, var(--bg-surface))' }}>
                    <Icon className="w-4 h-4 text-theme-primary" aria-hidden="true" />
                  </div>
                  <div className="text-[11px] font-black text-theme-text leading-tight">{label}</div>
                  <div className="text-[10px] font-semibold text-theme-text-secondary">{sub}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-80" aria-hidden="true">
        <span className="text-[10px] font-bold text-theme-text-secondary uppercase tracking-[0.15em]">scroll</span>
        <span className="w-5 h-8 rounded-full border-2 border-theme-border/70 flex items-start justify-center pt-1.5">
          <span className="w-1 h-2 rounded-full bg-theme-primary animate-bounce" />
        </span>
      </div>
    </section>
  );
};
