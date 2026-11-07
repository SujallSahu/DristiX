import React, { useEffect } from 'react';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { Clock, CheckCircle, Bookmark, Eye, TrendingUp } from 'lucide-react';

/**
 * ExamSidebar — Always-visible right panel during an active exam.
 *
 * Contains:
 *  • Countdown timer (keyboard shortcut T → speaks time)
 *  • Mini question palette grid (click to jump; Q opens full palette)
 *  • Question status breakdown counts
 *  • Section progress bar
 *
 * All keyboard shortcuts are handled globally in the parent keyboard handler.
 * This component only renders the visual panel; it does NOT intercept keys.
 */
export const ExamSidebar: React.FC = () => {
  const {
    questions,
    currentIndex,
    selectedOptions,
    markedForReview,
    visitedQuestions,
    timeRemaining,
    formattedTime,
    jumpToQuestion,
    setPaletteOpen,
    currentExam,
  } = useExamStore();

  const isTimeCritical = timeRemaining < 300; // under 5 min

  // Computed counts
  const answeredCount  = Object.keys(selectedOptions).length;
  const markedCount    = Object.values(markedForReview).filter(Boolean).length;
  const visitedCount   = Object.keys(visitedQuestions).length;
  const notAnswered    = questions.length - answeredCount;
  const notVisited     = questions.length - visitedCount;
  const progressPct    = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  // Speak time when T is pressed — handled by global keyboard handler in App, but
  // we expose a helper via a custom event so the global handler can call it.
  useEffect(() => {
    const handleAnnounceTime = () => {
      const minutes = Math.floor(timeRemaining / 60);
      const secs    = timeRemaining % 60;
      useAnnouncerStore.getState().announce(
        `Time remaining: ${minutes} minutes and ${secs} seconds. Display: ${formattedTime}.`,
        'assertive',
        true
      );
    };

    const handleAnnouncePalette = () => {
      useAnnouncerStore.getState().announce(
        `Question palette: ${questions.length} total. ${answeredCount} answered. ${markedCount} marked for review. ${notAnswered} not answered. ${notVisited} not yet visited. Currently on question ${currentIndex + 1}.`,
        'assertive',
        true,
        true
      );
    };

    window.addEventListener('dristix-announce-time', handleAnnounceTime);
    window.addEventListener('dristix-announce-palette', handleAnnouncePalette);
    return () => {
      window.removeEventListener('dristix-announce-time', handleAnnounceTime);
      window.removeEventListener('dristix-announce-palette', handleAnnouncePalette);
    };
  }, [timeRemaining, formattedTime, questions.length, answeredCount, markedCount, notAnswered, notVisited, currentIndex]);

  return (
    <aside
      aria-label="Exam sidebar: Timer, Question Palette, and Progress"
      className="w-full lg:w-72 xl:w-80 flex flex-col gap-3.5 flex-shrink-0 select-none lg:sticky lg:top-20"
    >
      {/* ── 1. Timer Card (Taller & Prominent) ── */}
      <div
        role="region"
        aria-label={`Time Remaining: ${formattedTime}. Press T to hear time.`}
        className={`rounded-2xl border-2 px-4 py-3.5 transition-all ${
          isTimeCritical
            ? 'border-red-500 bg-red-950/20 shadow-red-500/20 shadow-lg'
            : 'border-theme-border bg-theme-surface shadow-xs'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock
              className={`w-4 h-4 flex-shrink-0 ${isTimeCritical ? 'text-red-500 animate-pulse' : 'text-theme-focus-ring'}`}
              aria-hidden="true"
            />
            <span className="text-[11px] font-bold uppercase tracking-wider text-theme-text-secondary">
              Time Remaining
            </span>
          </div>
          <kbd className="text-xs px-2 py-0.5 rounded-md border border-theme-border bg-theme-bg font-mono font-bold text-theme-text-secondary shadow-xs">
            T
          </kbd>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('dristix-announce-time'))}
          title="Click or press T to hear time remaining"
          aria-label={`Time remaining: ${formattedTime}. Click to hear.`}
          className={`w-full text-center font-mono font-black text-3xl xl:text-4xl tracking-widest leading-tight py-2 rounded-xl transition hover:opacity-80 focus:outline-none focus-visible:ring-4 focus-visible:ring-theme-focus-ring ${
            isTimeCritical ? 'text-red-500' : 'text-theme-focus-ring'
          }`}
        >
          {formattedTime}
        </button>
        <p className="text-center text-[10px] text-theme-text-secondary mt-1 tracking-widest font-semibold select-none">
          HH &nbsp;:&nbsp; MM &nbsp;:&nbsp; SS
        </p>
      </div>

      {/* ── 2. Mini Question Palette (Taller Buttons) ── */}
      <div
        role="region"
        aria-label="Question Palette. Press Q to open full palette."
        className="rounded-2xl border-2 border-theme-border bg-theme-surface shadow-xs px-4 py-3.5"
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs sm:text-sm font-bold text-theme-text flex items-center gap-1.5">
            <span>Question Palette</span>
            <span className="text-xs text-theme-text-secondary font-mono">({currentIndex + 1}/{questions.length})</span>
          </h2>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('dristix-announce-palette'));
              setPaletteOpen(true);
            }}
            aria-label="Open full question palette (Shortcut: Q)"
            title="Open full question palette (Q)"
            className="text-xs font-bold px-2 py-1 rounded-lg border border-theme-border bg-theme-bg hover:bg-theme-surface text-theme-text-secondary flex items-center gap-1.5 transition shadow-xs"
          >
            <span>Full</span>
            <kbd className="font-mono text-[10px] border border-theme-border rounded px-1.5 py-0.5 bg-theme-surface text-theme-text font-bold">Q</kbd>
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between text-[11px] font-semibold text-theme-text-secondary mb-3 px-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-theme-focus-ring inline-block" aria-hidden="true" />
            Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
            Done
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" aria-hidden="true" />
            Marked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-theme-border inline-block" aria-hidden="true" />
            Left
          </span>
        </div>

        {/* Grid — clean grid with inset focus and zero overlap */}
        <div
          role="grid"
          aria-label="Question grid. Click any number to jump."
          className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-5 gap-2 p-1 max-h-48 overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {questions.map((q, idx) => {
            const isCurrent  = idx === currentIndex;
            const isAnswered = selectedOptions[q.id] !== undefined;
            const isMarked   = !!markedForReview[q.id];
            const isVisited  = !!visitedQuestions[q.id];

            let bgClass = 'bg-theme-bg border-theme-border text-theme-text-secondary';
            if (isCurrent)  bgClass = 'bg-theme-primary text-theme-primary-text border-2 border-theme-focus-ring shadow-sm z-10';
            else if (isMarked)   bgClass = 'bg-amber-500/25 border-amber-500/60 text-theme-text font-bold';
            else if (isAnswered) bgClass = 'bg-emerald-600/25 border-emerald-600/60 text-theme-text font-bold';
            else if (isVisited)  bgClass = 'bg-theme-surface border-theme-border text-theme-text';

            const statusLabel = isCurrent ? 'current' : isMarked ? 'marked' : isAnswered ? 'answered' : isVisited ? 'visited' : 'not visited';

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => jumpToQuestion(idx)}
                aria-label={`Question ${q.questionNumber}, ${statusLabel}. Click to go.`}
                title={`Q${q.questionNumber} — ${statusLabel}`}
                className={`relative h-9 sm:h-10 rounded-xl border text-sm font-black flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-theme-focus-ring ${bgClass} ${
                  isCurrent ? 'ring-2 ring-inset ring-theme-focus-ring' : 'hover:border-theme-primary/60'
                }`}
              >
                {q.questionNumber}
                {isMarked && !isCurrent && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-theme-surface shadow-xs" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. Question Status (Roomier 2x2 Grid) ── */}
      <div
        role="region"
        aria-label="Question status summary"
        className="rounded-2xl border-2 border-theme-border bg-theme-surface shadow-xs px-4 py-3.5"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs sm:text-sm font-bold text-theme-text">Question Status</h2>
          <span className="text-xs text-theme-text-secondary font-mono font-bold">{questions.length} total</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs" aria-label="Status counts">
          {/* Answered */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
            <span className="flex items-center gap-1.5 text-theme-text text-xs font-bold">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" aria-hidden="true" />
              Answered
            </span>
            <span className="font-black text-sm text-theme-text tabular-nums">{answeredCount}</span>
          </div>

          {/* Marked */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <span className="flex items-center gap-1.5 text-theme-text text-xs font-bold">
              <Bookmark className="w-4 h-4 text-amber-500 flex-shrink-0" aria-hidden="true" />
              Marked
            </span>
            <span className="font-black text-sm text-theme-text tabular-nums">{markedCount}</span>
          </div>

          {/* Not Answered */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-theme-bg border border-theme-border">
            <span className="flex items-center gap-1.5 text-theme-text-secondary text-xs font-semibold">
              <span className="w-3 h-3 rounded-full bg-theme-unattempted/60 flex-shrink-0" aria-hidden="true" />
              Unanswered
            </span>
            <span className="font-black text-sm text-theme-text tabular-nums">{notAnswered}</span>
          </div>

          {/* Not Visited */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-theme-bg border border-theme-border">
            <span className="flex items-center gap-1.5 text-theme-text-secondary text-xs font-semibold">
              <Eye className="w-4 h-4 text-theme-text-secondary/60 flex-shrink-0" aria-hidden="true" />
              Not Visited
            </span>
            <span className="font-black text-sm text-theme-text tabular-nums">{notVisited}</span>
          </div>
        </div>
      </div>

      {/* ── 4. Section Progress (Roomier) ── */}
      <div
        role="region"
        aria-label={`Section progress: ${progressPct}% complete`}
        className="rounded-2xl border-2 border-theme-border bg-theme-surface shadow-xs px-4 py-3"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs sm:text-sm font-bold text-theme-text flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-theme-primary" aria-hidden="true" />
            <span>Progress</span>
          </h2>
          <span
            className="text-xs sm:text-sm font-black tabular-nums"
            style={{ color: progressPct > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}
          >
            {progressPct}% ({answeredCount}/{currentExam.questions.length})
          </span>
        </div>

        <div className="h-2.5 w-full rounded-full bg-theme-border overflow-hidden" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full rounded-full bg-theme-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </aside>
  );
};
