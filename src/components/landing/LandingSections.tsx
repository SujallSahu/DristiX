import React, { useState } from 'react';
import {
  Accessibility, Ear, Keyboard, Contrast, Languages,
  FileText, Lightbulb, BarChart3, GraduationCap, Landmark,
  ShieldCheck, Train, ListChecks, BookOpen, BadgeCheck,
  MousePointer2, Timer, Mic, ArrowRight, Volume2,
  ChevronDown, Sparkles, Zap, Lock, Globe, Star,
  UserCheck, PlayCircle, CheckCircle2, Settings2,
  TrendingUp, Shield, Check,
} from 'lucide-react';
import { speechEngine } from '../../utils/speechEngine';
import { soundEffects } from '../../utils/soundEffects';

interface SectionProps {
  onSignIn: () => void;
}

/* ─────────────────────────────────────────────────────────────────
   SECTION WRAPPER — consistent padding + bg
───────────────────────────────────────────────────────────────── */
const Section: React.FC<{
  id?: string;
  alt?: boolean;
  accent?: 'left' | 'right' | 'center' | 'none';
  children: React.ReactNode;
  className?: string;
}> = ({ id, alt, accent = 'none', children, className = '' }) => (
  <section
    id={id}
    className={`relative overflow-hidden py-12 sm:py-20 lg:py-28 ${className}`}
    style={{
      background: alt
        ? 'color-mix(in srgb, var(--primary) 3.5%, var(--bg-surface))'
        : 'var(--bg-page)',
    }}
  >
    {accent !== 'none' && (
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            accent === 'left'
              ? 'radial-gradient(ellipse 60% 60% at 0% 50%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 70%)'
              : accent === 'right'
              ? 'radial-gradient(ellipse 60% 60% at 100% 50%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 70%)'
              : 'radial-gradient(ellipse 70% 60% at 50% 50%, color-mix(in srgb, var(--primary) 8%, transparent), transparent 70%)',
        }}
      />
    )}
    {children}
  </section>
);

/* ─────────────────────────────────────────────────────────────────
   SECTION HEADER — reusable label + headline + subline
───────────────────────────────────────────────────────────────── */
const SectionHeader: React.FC<{
  pill: React.ReactNode;
  heading: React.ReactNode;
  sub?: string;
  center?: boolean;
  className?: string;
  subClassName?: string;
}> = ({ pill, heading, sub, center = true, className = '', subClassName = '' }) => (
  <div className={`${center ? 'text-center mx-auto' : ''} ${className ? className : 'max-w-2xl'} mb-6 sm:mb-12 lg:mb-16`}>
    <span className="dx-label-pill mb-2.5 sm:mb-4 inline-flex">{pill}</span>
    <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-[-0.03em] sm:tracking-[-0.04em] leading-[1.15] sm:leading-[1.08] text-theme-text mt-1.5 sm:mt-4">
      {heading}
    </h2>
    {sub && (
      <p className={`mt-2.5 sm:mt-4 text-xs sm:text-base lg:text-lg text-theme-text-secondary font-medium leading-relaxed ${subClassName ? subClassName : 'max-w-[58ch]'} mx-auto`}>
        {sub}
      </p>
    )}
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
   MARQUEE FEATURE STRIP
═══════════════════════════════════════════════════════════════════ */

const FEATURES = [
  { icon: Accessibility, label: 'Visually Impaired First'   },
  { icon: Ear,           label: 'Screen Reader Optimized'   },
  { icon: Keyboard,      label: 'Keyboard-only Navigation'  },
  { icon: Contrast,      label: 'High Contrast Themes'      },
  { icon: Languages,     label: 'Hindi & English Voice'     },
  { icon: FileText,      label: 'Mock Tests & Practice'     },
  { icon: Lightbulb,     label: 'Hints, Solutions & Review' },
  { icon: BarChart3,     label: 'Performance Analytics'     },
  { icon: Lock,          label: 'Server-side Timers'        },
  { icon: Globe,         label: 'Multi-language Voice'      },
  { icon: Star,          label: 'Previous Year Papers'      },
  { icon: Zap,           label: 'Instant Results'           },
] as const;

export const FeatureStrip: React.FC = () => {
  const doubled = [...FEATURES, ...FEATURES];
  return (
    <div
      id="features"
      className="overflow-hidden py-4 border-y"
      style={{
        background: 'color-mix(in srgb, var(--primary) 5%, var(--bg-surface))',
        borderColor: 'color-mix(in srgb, var(--border-color) 45%, transparent)',
      }}
    >
      <div className="dx-marquee-wrap">
        <ul className="dx-marquee-track list-none m-0 p-0">
          {doubled.map(({ icon: Icon, label }, i) => (
            <li
              key={`${label}-${i}`}
              className="inline-flex items-center gap-2.5 px-7 shrink-0 border-r"
              style={{ borderColor: 'color-mix(in srgb, var(--border-color) 28%, transparent)' }}
            >
              <Icon className="w-3.5 h-3.5 text-theme-primary shrink-0" aria-hidden="true" />
              <span className="text-[13px] font-semibold text-theme-text-secondary whitespace-nowrap tracking-tight">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   HOW IT WORKS — clean 4-step horizontal flow
═══════════════════════════════════════════════════════════════════ */

const STEPS = [
  {
    num: '01',
    icon: UserCheck,
    title: 'Sign in',
    body: 'Use the roll number and password issued by your institution. No sign-up friction.',
  },
  {
    num: '02',
    icon: Settings2,
    title: 'Set preferences',
    body: 'Choose your contrast theme, scale text up to 200%, and toggle spoken output.',
  },
  {
    num: '03',
    icon: PlayCircle,
    title: 'Start your test',
    body: 'Pick an exam from the catalogue and launch. The server starts your timer immediately.',
  },
  {
    num: '04',
    icon: TrendingUp,
    title: 'Review analytics',
    body: 'After submission, get a full diagnostic report with accuracy, scores and time breakdown.',
  },
] as const;

export const HowItWorks: React.FC = () => (
  <Section accent="center">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <SectionHeader
        className="max-w-5xl"
        subClassName="max-w-none md:whitespace-nowrap"
        pill={<><Zap className="w-3 h-3" aria-hidden="true" />How It Works</>}
        heading={<>Login to Results,{' '}<span className="dx-gradient-text">in 4 Steps</span></>}
        sub="No tutorials or onboarding videos. The platform explains itself — spoken aloud if you need it."
      />

      {/* Steps grid with connector line */}
      <div className="relative">
        {/* Desktop connector line */}
        <div
          className="hidden lg:block absolute top-[2.75rem] left-[calc(12.5%+1.5rem)] right-[calc(12.5%+1.5rem)] h-px"
          aria-hidden="true"
          style={{
            background:
              'linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary) 35%, transparent) 20%, color-mix(in srgb, var(--primary) 35%, transparent) 80%, transparent)',
          }}
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map(({ num, icon: Icon, title, body }) => (
            <div key={num} className="dx-step-card p-7 flex flex-col gap-5 group relative">
              {/* Step number badge */}
              <div className="flex items-center gap-4">
                <div
                  className="relative w-11 h-11 rounded-2xl grid place-items-center text-theme-primary-text shrink-0 transition-all duration-300 group-hover:scale-110 shadow-md group-hover:shadow-lg z-10"
                  style={{
                    background: 'var(--primary-gradient)',
                    border: '1.5px solid color-mix(in srgb, var(--primary) 40%, transparent)',
                    boxShadow: '0 4px 16px var(--primary-glow), 0 0 0 4px var(--bg-page)',
                  }}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <span
                  className="text-3xl font-black tabular-nums leading-none dx-gradient-text opacity-75 group-hover:opacity-100 transition-opacity duration-300"
                  aria-hidden="true"
                >
                  {num}
                </span>
              </div>

              <div>
                <h3 className="text-base font-black text-theme-text group-hover:text-theme-primary transition-colors leading-snug">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-theme-text-secondary font-medium leading-relaxed">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Section>
);

/* ═══════════════════════════════════════════════════════════════════
   EXAM CATEGORIES — clean uniform 3-col grid (NO broken bento)
═══════════════════════════════════════════════════════════════════ */

const CATEGORIES = [
  {
    icon: GraduationCap,
    name: 'Staff Selection',
    detail: 'SSC CGL Tier-1 mock tests and reasoning drills for competitive prep.',
    tag: 'SSC CGL',
    featured: true,
  },
  {
    icon: Landmark,
    name: 'Banking & Insurance',
    detail: 'IBPS PO speed drills and quantitative arithmetic practice sets.',
    tag: 'IBPS PO',
    featured: false,
  },
  {
    icon: ShieldCheck,
    name: 'Civil Services',
    detail: 'UPSC CSAT Paper-II and general studies prep modules.',
    tag: 'UPSC',
    featured: false,
  },
  {
    icon: Train,
    name: 'Railways',
    detail: 'RRB NTPC general awareness sprint and technical sections.',
    tag: 'RRB NTPC',
    featured: false,
  },
  {
    icon: ListChecks,
    name: 'Logical Reasoning',
    detail: 'Syllogisms, seating arrangement and series drills.',
    tag: 'Reasoning',
    featured: false,
  },
  {
    icon: BookOpen,
    name: 'Verbal Ability',
    detail: 'Vocabulary, grammar correction and reading comprehension.',
    tag: 'English',
    featured: false,
  },
] as const;

export const ExamCategories: React.FC<SectionProps> = ({ onSignIn }) => (
  <Section id="exams" alt accent="right">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      {/* Header row: heading left, CTA right */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-8 mb-14">
        <div className="max-w-xl">
          <SectionHeader
            center={false}
            pill={<><Star className="w-3 h-3" aria-hidden="true" />Exam Catalogue</>}
            heading={<>Every Major Exam,{' '}<span className="dx-gradient-text">Fully Accessible.</span></>}
            sub="Pick your target exam and start practising — each test is readable aloud, answerable by voice, navigable by keyboard alone."
          />
        </div>
        <button
          type="button"
          onClick={onSignIn}
          className="dx-btn-primary h-12 px-8 text-sm flex items-center gap-2.5 group shrink-0 mb-16"
        >
          <span className="relative z-10">Browse All Exams</span>
          <ArrowRight
            className="relative z-10 w-4 h-4 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Uniform 3-col grid — no broken spanning */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 list-none m-0 p-0">
        {CATEGORIES.map(({ icon: Icon, name, detail, tag, featured }) => (
          <li key={name} className="flex">
            <div
              className="dx-feature-card w-full text-left p-7 flex flex-col gap-5 min-h-[220px] cursor-default"
              style={
                featured
                  ? {
                      background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-surface))',
                      borderColor: 'color-mix(in srgb, var(--primary) 35%, transparent)',
                    }
                  : {}
              }
            >
              {/* Top row: icon + tag */}
              <div className="flex items-start justify-between gap-3">
                <div
                  className="w-11 h-11 grid place-items-center rounded-2xl text-theme-primary shrink-0 transition-all duration-300"
                  style={{
                    background: featured
                      ? 'color-mix(in srgb, var(--primary) 18%, var(--bg-surface))'
                      : 'color-mix(in srgb, var(--primary) 10%, var(--bg-surface))',
                    border: '1.5px solid color-mix(in srgb, var(--primary) 28%, transparent)',
                  }}
                  aria-hidden="true"
                >
                  <Icon className="w-5 h-5" />
                </div>

                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shrink-0"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                    color: 'var(--primary)',
                    border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                  }}
                >
                  {tag}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-theme-text leading-snug">
                    {name}
                    {featured && (
                      <span
                        className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-black uppercase align-middle"
                        style={{
                          background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                          color: 'var(--primary)',
                        }}
                      >
                        Popular
                      </span>
                    )}
                  </h3>
                  <p className="mt-2 text-sm text-theme-text-secondary font-medium leading-relaxed">
                    {detail}
                  </p>
                </div>

                <div
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-theme-primary"
                  aria-hidden="true"
                >
                  <CheckCircle2 className="w-4 h-4 text-theme-primary" />
                  <span>Practice Drills &amp; Mock Tests Available</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </Section>
);

/* ═══════════════════════════════════════════════════════════════════
   VOICE SHOWCASE
═══════════════════════════════════════════════════════════════════ */

const VOICE_DEMOS = [
  {
    cmd: 'Read question',
    desc: 'Reads the current question and section aloud.',
    output: 'Question 3 of 10. Quantitative Aptitude: What is the measure of each interior angle of an equilateral triangle?',
  },
  {
    cmd: 'Option 3',
    desc: 'Selects choice 3 and confirms full option text back.',
    output: 'Option 3 selected: 120 degrees. Say "Next question" to continue.',
  },
  {
    cmd: 'Mark for review',
    desc: 'Flags the question so you can revisit it later.',
    output: 'Question 3 marked for review. Say "Next question" or "Previous question".',
  },
  {
    cmd: 'Next question',
    desc: 'Navigates immediately to the next question.',
    output: 'Moving to Question 4 of 10. Section: Quantitative Aptitude.',
  },
] as const;

export const VoiceShowcase: React.FC = () => {
  const [active, setActive] = useState(1);

  const handleSelectDemo = (idx: number) => {
    setActive(idx);
    try {
      soundEffects.playSelect();
    } catch {}
    try {
      speechEngine.speak(VOICE_DEMOS[idx].output, true);
    } catch {}
  };

  const handleSpeakAgain = () => {
    try {
      soundEffects.playSelect();
      speechEngine.speak(VOICE_DEMOS[active].output, true);
    } catch {}
  };

  return (
    <Section accent="left">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10">
        <SectionHeader
          pill={<><Mic className="w-3 h-3" aria-hidden="true" />Interactive Demo</>}
          heading={
            <>
              Speak Your Answer.{' '}
              <span className="block sm:inline sm:ml-1 dx-gradient-text">
                No Mouse Needed.
              </span>
            </>
          }
          sub="Tap any command to preview how DristiX listens, confirms and navigates in real time."
        />

        <div className="grid lg:grid-cols-5 gap-3 sm:gap-6 items-stretch">
          {/* Commands: 2x2 grid on mobile (< lg), vertical stack on desktop (lg:) */}
          <div className="lg:col-span-2 grid grid-cols-2 lg:flex lg:flex-col gap-2 sm:gap-3" role="tablist" aria-label="Sample voice commands">
            {VOICE_DEMOS.map((demo, idx) => (
              <button
                key={demo.cmd}
                type="button"
                role="tab"
                aria-selected={active === idx}
                onClick={() => handleSelectDemo(idx)}
                className={`text-left p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 group cursor-pointer ${
                  active === idx ? 'shadow-lg ring-2 ring-theme-primary/30' : 'hover:border-theme-primary/50'
                }`}
                style={
                  active === idx
                    ? {
                        background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-surface))',
                        borderColor: 'var(--primary)',
                        boxShadow: '0 4px 20px var(--primary-glow)',
                      }
                    : {
                        background: 'color-mix(in srgb, var(--bg-surface) 60%, transparent)',
                        borderColor: 'color-mix(in srgb, var(--border-color) 55%, transparent)',
                      }
                }
              >
                <div className="flex items-center justify-between w-full sm:w-auto gap-2">
                  <span
                    className={`w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl grid place-items-center shrink-0 transition-all ${
                      active === idx ? 'scale-105' : 'group-hover:scale-105'
                    }`}
                    style={
                      active === idx
                        ? { background: 'var(--primary-gradient)', boxShadow: '0 2px 10px var(--primary-glow)' }
                        : { background: 'color-mix(in srgb, var(--border-color) 40%, transparent)' }
                    }
                  >
                    <Mic
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${active === idx ? 'text-theme-primary-text' : 'text-theme-text-secondary'}`}
                      aria-hidden="true"
                    />
                  </span>
                  {active === idx && (
                    <span className="sm:hidden flex items-center gap-1 text-[10px] font-black uppercase text-theme-primary tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 w-full">
                  <div className="text-xs sm:text-sm font-black font-mono text-theme-text truncate sm:whitespace-normal">
                    "{demo.cmd}"
                  </div>
                  <div className="text-[11px] sm:text-xs text-theme-text-secondary mt-0.5 hidden sm:block font-medium leading-snug">
                    {demo.desc}
                  </div>
                </div>
                {active === idx && (
                  <Sparkles className="hidden sm:block w-4 h-4 text-theme-primary shrink-0 animate-pulse" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>

          {/* Live Output Card — always immediately visible right below the 2x2 grid on mobile */}
          <div className="lg:col-span-3 dx-feature-card p-3.5 sm:p-7 flex flex-col gap-3 sm:gap-6 mt-1 sm:mt-0">
            {/* Header bar */}
            <div
              className="flex items-center justify-between border-b pb-2.5 sm:pb-4"
              style={{ borderColor: 'color-mix(in srgb, var(--border-color) 40%, transparent)' }}
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                  <span className="dx-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-emerald-500" />
                </span>
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-theme-text-secondary">
                  Voice Assistant · Live
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSpeakAgain()}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 14%, var(--bg-surface))',
                    color: 'var(--primary)',
                    border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                  }}
                  title="Click to replay spoken response"
                  aria-label="Replay spoken audio"
                >
                  <Volume2 className="w-3.5 h-3.5 animate-pulse text-theme-primary" aria-hidden="true" />
                  <span>Replay Audio</span>
                </button>
                <span
                  className="hidden sm:inline-block px-2.5 py-1 rounded-lg text-xs font-black"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                    color: 'var(--primary)',
                    border: '1px solid color-mix(in srgb, var(--primary) 28%, transparent)',
                  }}
                >
                  Command Registered
                </span>
              </div>
            </div>

            {/* Candidate Spoke */}
            <div>
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-theme-text-secondary mb-1.5 sm:mb-2.5">
                Candidate Spoke
              </p>
              <div
                className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl border"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 6%, var(--bg-page))',
                  borderColor: 'color-mix(in srgb, var(--border-color) 45%, transparent)',
                }}
              >
                <div
                  className="w-7 h-7 sm:w-8 sm:h-8 grid place-items-center rounded-lg text-theme-primary-text shrink-0"
                  style={{ background: 'var(--primary-gradient)' }}
                >
                  <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                </div>
                <span className="font-black font-mono text-xs sm:text-sm text-theme-text">
                  "{VOICE_DEMOS[active].cmd}"
                </span>
              </div>
            </div>

            {/* System response */}
            <div className="flex-1">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-theme-text-secondary mb-1.5 sm:mb-2.5">
                DristiX Spoken Response
              </p>
              <div
                className="flex items-start gap-3 sm:gap-4 p-3.5 sm:p-5 rounded-xl border-2 h-full min-h-[85px] sm:min-h-[100px]"
                style={{
                  background: 'color-mix(in srgb, var(--bg-surface) 65%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--primary) 38%, transparent)',
                  boxShadow: '0 0 20px color-mix(in srgb, var(--primary) 8%, transparent)',
                }}
              >
                <div
                  className="w-7 h-7 sm:w-9 sm:h-9 grid place-items-center rounded-xl text-theme-primary-text shrink-0 shadow-md"
                  style={{ background: 'var(--primary-gradient)', boxShadow: '0 3px 12px var(--primary-glow)' }}
                >
                  <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="text-xs sm:text-base font-semibold text-theme-text leading-snug sm:leading-relaxed">
                    {VOICE_DEMOS[active].output}
                  </p>
                  <p className="text-[11px] text-theme-text-secondary mt-1 font-medium sm:hidden">
                    🔊 Spoken aloud automatically. Tap Replay to hear again.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   STATS BAND — large impactful numbers
═══════════════════════════════════════════════════════════════════ */

const FACTS = [
  {
    icon: BadgeCheck,
    value: '100%',
    sub: 'WCAG Compliance',
    label: 'Built to WCAG 2.1 AA, audited with axe-core in the exam portal',
  },
  {
    icon: Contrast,
    value: '4',
    sub: 'Contrast Themes',
    label: 'High-contrast themes, plus text scaling up to 200% on all pages',
  },
  {
    icon: MousePointer2,
    value: '0',
    sub: 'Mouse Required',
    label: 'Every step on the platform works by voice or keyboard alone',
  },
  {
    icon: Languages,
    value: '2',
    sub: 'Voice Languages',
    label: 'Hindi and English voice engines read every question aloud',
  },
] as const;

export const StatsBand: React.FC = () => (
  <Section alt accent="center" id="stats">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <SectionHeader
        pill={<><Zap className="w-3 h-3" aria-hidden="true" />At a Glance</>}
        heading={<>Numbers That <span className="dx-gradient-text">Matter</span></>}
        sub="Every figure below is verifiable in this codebase — no invented usage statistics."
      />

      <ul className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5 list-none m-0 p-0">
        {FACTS.map(({ icon: Icon, value, sub, label }) => (
          <li key={sub} className="dx-stat-card p-4 sm:p-8 flex flex-col gap-3 sm:gap-5 group cursor-default">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 sm:w-11 sm:h-11 grid place-items-center rounded-2xl text-theme-primary shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:text-theme-primary-text"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 12%, var(--bg-surface))',
                  border: '1.5px solid color-mix(in srgb, var(--primary) 28%, transparent)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--primary-gradient)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 12%, var(--bg-surface))')}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              </div>
            </div>

            <div>
              <div className="text-3xl sm:text-5xl lg:text-6xl font-black leading-none tracking-tight dx-gradient-text">
                {value}
              </div>
              <div className="mt-1 text-xs sm:text-sm font-black text-theme-text tracking-tight">{sub}</div>
              <p className="mt-2 sm:mt-3 text-xs sm:text-sm font-semibold text-theme-text-secondary leading-snug max-w-[24ch]">
                {label}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </Section>
);

/* ═══════════════════════════════════════════════════════════════════
   WHY CHOOSE — 2×2 feature cards with checkmark extras
═══════════════════════════════════════════════════════════════════ */

const REASONS = [
  {
    icon: Ear,
    tag: 'Voice First',
    title: 'Every question reads itself',
    body: 'Navigate and the question, section and all options are spoken in order. Say "Read question" at any point to hear it again. Zero setup required.',
    extras: ['Auto-reads on focus', 'Adjustable speech rate', 'Pause & resume'],
  },
  {
    icon: Mic,
    tag: 'Hands-Free',
    title: 'Answer by voice, not cursor',
    body: 'Say "Option 3" and the assistant repeats the option\'s own words back — never just the number — so you know exactly what was recorded.',
    extras: ['Full option confirmation', 'Mark for review', 'Navigate sections'],
  },
  {
    icon: Contrast,
    tag: 'Accessible',
    title: 'Set up access before sign-in',
    body: 'Four contrast themes, text scaling up to 200%, line spacing and hyper-legible type are available on this public page — not buried in settings.',
    extras: ['4 WCAG contrast themes', 'Text scaling to 200%', 'Dyslexia-friendly font'],
  },
  {
    icon: Timer,
    tag: 'Reliable',
    title: 'A clock the server owns',
    body: 'The exam deadline is stored on the server. A dropped connection, browser refresh or sleeping laptop cannot cost you a single second of exam time.',
    extras: ['Server-authoritative', 'Reconnect-safe', 'No time manipulation'],
  },
] as const;

export const WhyChoose: React.FC = () => (
  <Section id="why" accent="right">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <SectionHeader
        pill={<><BadgeCheck className="w-3 h-3" aria-hidden="true" />Accessibility First</>}
        heading={<>Why Choose <span className="dx-gradient-text">DristiX?</span></>}
        sub="Accessibility is not a bolt-on screen reader mode — it is the interaction model the whole exam is built around."
      />

      <div className="grid sm:grid-cols-2 gap-5">
        {REASONS.map(({ icon: Icon, tag, title, body, extras }) => (
          <div key={title} className="dx-feature-card p-7 flex flex-col gap-6 group">
            {/* Tag + icon row */}
            <div className="flex items-center justify-between">
              <span className="dx-label-pill">{tag}</span>
              <div
                className="w-11 h-11 grid place-items-center rounded-2xl text-theme-primary transition-all duration-300 group-hover:scale-110 group-hover:text-theme-primary-text"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-surface))',
                  border: '1.5px solid color-mix(in srgb, var(--primary) 28%, transparent)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--primary-gradient)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 10%, var(--bg-surface))')}
                aria-hidden="true"
              >
                <Icon className="w-5 h-5" />
              </div>
            </div>

            {/* Body */}
            <div>
              <h3 className="text-xl font-black text-theme-text group-hover:text-theme-primary transition-colors leading-snug">
                {title}
              </h3>
              <p className="mt-2.5 text-sm sm:text-base text-theme-text-secondary font-medium leading-relaxed">
                {body}
              </p>
            </div>

            {/* Check pills */}
            <ul className="flex flex-wrap gap-2 list-none m-0 p-0 mt-auto">
              {extras.map((e) => (
                <li
                  key={e}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-page))',
                    color: 'var(--primary)',
                    border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)',
                  }}
                >
                  <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </Section>
);

/* ═══════════════════════════════════════════════════════════════════
   FAQ ACCORDION
═══════════════════════════════════════════════════════════════════ */

const FAQS = [
  {
    q: 'How does hands-free voice control work during exams?',
    a: 'Activate voice control via your microphone. Commands like "Read Question", "Select Option 2", "Mark for Review" and "Next Question" let you complete an entire exam without touching a mouse or keyboard.',
  },
  {
    q: 'Can blind or low-vision candidates take tests independently?',
    a: 'Yes. DristiX is screen-reader-first, audited with axe-core for WCAG 2.1 AA compliance. Questions, choices, timers and diagnostic reports are all read aloud automatically.',
  },
  {
    q: 'Which competitive exams are currently supported?',
    a: 'Full mock tests for SSC CGL, IBPS PO, UPSC CSAT, RRB NTPC, plus General Reasoning and Verbal Ability modules are available in the current catalogue.',
  },
  {
    q: 'How do I change contrast themes or text scaling?',
    a: 'The header bar lets you cycle between High Contrast Light, High Contrast Dark, Yellow on Black and Warm Sepia themes, and scale text up to 200% — all before you sign in.',
  },
  {
    q: 'Are exam countdown clocks server-authoritative?',
    a: 'Yes. The exam deadline is stored and calculated on the server. Closing a tab, refreshing or losing internet connection will never reset or alter your exam timer.',
  },
] as const;

export const FaqSection: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section alt accent="left">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <SectionHeader
          pill="FAQ"
          heading={<>Everything You <span className="dx-gradient-text">Need to Know</span></>}
          sub="Can't find your answer? Contact your institution administrator."
        />

        <div className="flex flex-col gap-3">
          {FAQS.map((faq, idx) => (
            <div key={faq.q} className="dx-feature-card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(open === idx ? null : idx)}
                aria-expanded={open === idx}
                className="w-full text-left px-4 sm:px-6 py-3.5 sm:py-5 flex items-center justify-between gap-3 sm:gap-5 focus:outline-none group"
              >
                <span className="font-black text-sm sm:text-base text-theme-text group-hover:text-theme-primary transition-colors leading-snug">
                  {faq.q}
                </span>
                <span
                  className="w-8 h-8 shrink-0 grid place-items-center rounded-xl transition-all duration-300"
                  style={
                    open === idx
                      ? { background: 'var(--primary-gradient)' }
                      : { background: 'color-mix(in srgb, var(--border-color) 40%, transparent)' }
                  }
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-300 ${
                      open === idx ? 'rotate-180 text-white' : 'text-theme-text-secondary'
                    }`}
                    aria-hidden="true"
                  />
                </span>
              </button>

              {open === idx && (
                <div
                  className="px-4 sm:px-6 pb-4 sm:pb-6 pt-1 text-sm sm:text-base leading-relaxed text-theme-text-secondary font-medium border-t"
                  style={{ borderColor: 'color-mix(in srgb, var(--border-color) 35%, transparent)' }}
                >
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   CLOSING CTA — full-bleed cinematic
═══════════════════════════════════════════════════════════════════ */

export const ClosingCta: React.FC<SectionProps> = ({ onSignIn }) => (
  <section className="relative py-28 sm:py-40 overflow-hidden" style={{ background: 'var(--primary-gradient)' }}>
    {/* Subtle grid */}
    <div
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    />
    {/* Glow orbs */}
    <div className="absolute -top-40 left-1/4 w-[500px] h-[500px] rounded-full bg-white/10 blur-3xl pointer-events-none" aria-hidden="true" />
    <div className="absolute -bottom-32 right-1/4 w-[400px] h-[400px] rounded-full bg-white/10 blur-3xl pointer-events-none" aria-hidden="true" />

    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
      <span
        className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest border text-theme-primary-text mb-8"
        style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.22)' }}
      >
        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
        Start Today — Free
      </span>

      <h2 className="text-2xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-[-0.03em] sm:tracking-[-0.045em] leading-[1.1] sm:leading-[1.03] text-theme-primary-text text-balance">
        The test starts the moment you're ready.
      </h2>

      <p className="mt-4 sm:mt-7 text-sm sm:text-lg lg:text-xl leading-relaxed text-theme-primary-text opacity-90 font-medium max-w-[52ch] mx-auto">
        Sign in with the roll number and password your institution issued.
        Registration is by institution invitation only.
      </p>

      <div className="mt-8 sm:mt-14 flex flex-col sm:flex-row justify-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={onSignIn}
          className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-12 rounded-2xl font-black text-sm sm:text-lg transition-all hover:scale-105 active:scale-97 flex items-center justify-center gap-2.5 sm:gap-3 group shadow-2xl"
          style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
        >
          <span>Sign in to your account</span>
          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>
        <a
          href="#exams"
          className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-9 rounded-2xl border-2 font-extrabold text-sm sm:text-lg text-theme-primary-text hover:bg-white/10 hover:scale-105 active:scale-97 transition-all inline-flex items-center justify-center no-underline"
          style={{ borderColor: 'rgba(255,255,255,0.32)' }}
        >
          Browse exams first
        </a>
      </div>

      {/* Trust badges */}
      <div className="mt-14 flex flex-wrap justify-center items-center gap-x-8 gap-y-3">
        {['WCAG 2.1 AA', 'Screen Reader First', 'Keyboard Complete', 'Server Timers'].map((t) => (
          <span key={t} className="flex items-center gap-2 text-xs font-bold text-theme-primary-text opacity-85">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
            {t}
          </span>
        ))}
      </div>
    </div>
  </section>
);

/* ═══════════════════════════════════════════════════════════════════
   FOOTER
═══════════════════════════════════════════════════════════════════ */

export const LandingFooter: React.FC<SectionProps> = ({ onSignIn }) => (
  <footer
    role="contentinfo"
    style={{ background: 'color-mix(in srgb, var(--bg-surface-elevated) 96%, var(--primary) 4%)' }}
  >
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-4"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--border-color) 35%, transparent)' }}
    >
      {/* Brand */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <span
            className="w-10 h-10 grid place-items-center rounded-xl text-theme-primary-text font-black text-sm shadow-lg"
            style={{ background: 'var(--primary-gradient)', boxShadow: '0 4px 16px var(--primary-glow)' }}
          >
            DX
          </span>
          <span className="font-black text-xl tracking-tight text-theme-text">DristiX</span>
        </div>
        <p className="text-sm leading-relaxed text-theme-text-secondary font-medium max-w-[34ch]">
          An accessible examination and practice portal: screen-reader first, keyboard-complete and spoken from end to end.
        </p>
        <div
          className="mt-5 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl"
          style={{
            background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-page))',
            border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)',
          }}
        >
          <Shield className="w-3.5 h-3.5 text-theme-primary" aria-hidden="true" />
          <span className="text-xs font-bold text-theme-primary">WCAG 2.1 AA Compliant</span>
        </div>
      </div>

      {/* Portal links */}
      <nav aria-label="Portal links">
        <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-theme-text-secondary mb-5">Portal</h2>
        <ul className="flex flex-col gap-3 list-none m-0 p-0">
          {[['Features', '#features'], ['Exams & drills', '#exams'], ['Why DristiX', '#why']].map(([l, h]) => (
            <li key={l}>
              <a href={h} className="text-sm font-semibold text-theme-text-secondary no-underline hover:text-theme-primary transition-colors">{l}</a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Accessibility links */}
      <nav aria-label="Accessibility links">
        <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-theme-text-secondary mb-5">Accessibility</h2>
        <ul className="flex flex-col gap-3 list-none m-0 p-0">
          {[['Colour themes', '#top'], ['Text scaling', '#top'], ['Voice commands', '#why']].map(([l, h]) => (
            <li key={l}>
              <a href={h} className="text-sm font-semibold text-theme-text-secondary no-underline hover:text-theme-primary transition-colors">{l}</a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sign in */}
      <div>
        <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-theme-text-secondary mb-5">Candidate</h2>
        <button
          type="button"
          onClick={onSignIn}
          className="w-full h-11 px-4 rounded-xl font-bold text-sm text-theme-primary-text transition-all hover:scale-105 active:scale-95 shadow-md"
          style={{ background: 'var(--primary-gradient)', boxShadow: '0 4px 16px var(--primary-glow)' }}
        >
          Sign in
        </button>
        <p className="mt-3 text-xs text-theme-text-secondary font-medium leading-snug">
          Registration is invite-only from your institution.
        </p>
      </div>
    </div>

    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-theme-text-secondary"
    >
      <p className="m-0">© 2026 DristiX. Built to WCAG 2.1 level AA.</p>
      <p className="m-0">Voice, keyboard and screen reader tested throughout.</p>
    </div>
  </footer>
);
