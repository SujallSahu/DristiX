import React, { useEffect, useRef, useState } from 'react';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { X, CheckCircle, Bookmark, Filter, Volume2 } from 'lucide-react';

export const QuestionPalette: React.FC = () => {
  const {
    questions,
    currentIndex,
    selectedOptions,
    markedForReview,
    isPaletteOpen,
    setPaletteOpen,
    jumpToQuestion,
    activeSectionFilter,
    setActiveSectionFilter,
  } = useExamStore();

  const [statusFilter, setStatusFilter] = useState<'all' | 'answered' | 'unanswered' | 'marked'>('all');
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Announce upon opening palette and trap focus
  useEffect(() => {
    if (isPaletteOpen) {
      closeButtonRef.current?.focus();
      const answeredCount = Object.keys(selectedOptions).length;
      const markedCount = Object.values(markedForReview).filter(Boolean).length;
      useAnnouncerStore
        .getState()
        .announce(
          `Question Palette opened. Total ${questions.length} questions. ${answeredCount} answered, ${markedCount} marked for review. Current is Question ${currentIndex + 1}. Press Tab to explore questions, or Escape to close.`,
          'assertive',
          true,
          true
        );
    }
  }, [isPaletteOpen, questions.length, selectedOptions, markedForReview, currentIndex]);

  if (!isPaletteOpen) return null;

  const filteredQuestions = questions.filter((q) => {
    if (activeSectionFilter !== 'All' && q.section !== activeSectionFilter) {
      return false;
    }
    const isAnswered = selectedOptions[q.id] !== undefined;
    const isMarked = !!markedForReview[q.id];

    if (statusFilter === 'answered') return isAnswered;
    if (statusFilter === 'unanswered') return !isAnswered;
    if (statusFilter === 'marked') return isMarked;
    return true;
  });

  const handleSpeakPaletteSummary = () => {
    const answeredCount = Object.keys(selectedOptions).length;
    const markedCount = Object.values(markedForReview).filter(Boolean).length;
    const unattempted = questions.length - answeredCount;
    useAnnouncerStore.getState().announce(
      `Question Palette summary: Total ${questions.length} questions. ${answeredCount} answered, ${unattempted} not answered, ${markedCount} marked for review. Currently showing ${filteredQuestions.length} questions in grid.`,
      'assertive',
      true,
      true
    );
  };

  const handleSectionFilterChange = (sec: string) => {
    setActiveSectionFilter(sec);
    useAnnouncerStore.getState().announce(`Filtered by section: ${sec}`, 'assertive', true, true);
  };

  const handleStatusFilterChange = (status: 'all' | 'answered' | 'unanswered' | 'marked') => {
    setStatusFilter(status);
    const label =
      status === 'all'
        ? 'All Questions'
        : status === 'answered'
        ? 'Answered Questions'
        : status === 'unanswered'
        ? 'Unanswered Questions'
        : 'Marked for Review';
    useAnnouncerStore.getState().announce(`Filtered by status: ${label}`, 'assertive', true, true);
  };

  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'q') {
      e.preventDefault();
      e.stopPropagation();
      setPaletteOpen(false);
      return;
    }

    if (e.key === 'Tab') {
      const container = modalRef.current;
      if (!container) return;

      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="palette-heading"
      onKeyDown={handleModalKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs"
    >
      <div
        ref={modalRef}
        className="w-full max-w-2xl max-h-[90vh] bg-theme-surface border-2 border-theme-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-theme-text"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b-2 border-theme-border flex justify-between items-center bg-theme-bg">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="palette-heading" className="text-xl font-bold">
                Question Palette & Navigator
              </h2>
              <button
                type="button"
                onClick={handleSpeakPaletteSummary}
                title="Speak palette summary aloud"
                aria-label="Speak palette summary aloud"
                className="p-1.5 rounded border border-theme-border bg-theme-surface hover:bg-theme-bg"
              >
                <Volume2 className="w-4 h-4 text-theme-focus-ring" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-theme-text-secondary mt-0.5">
              Review and jump directly to any question. Tab to navigate. Press Escape to close.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setPaletteOpen(false)}
            aria-label="Close question palette"
            className="p-2 rounded-lg border-2 border-theme-border hover:bg-theme-surface transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Legend / Status Indicators */}
        <div className="p-3 sm:p-4 border-b border-theme-border bg-theme-surface flex flex-wrap gap-3 text-xs sm:text-sm font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 border border-theme-border" aria-hidden="true" />
            <span>Answered</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 border border-theme-border" aria-hidden="true" />
            <span>Marked for Review</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-slate-400 border border-theme-border" aria-hidden="true" />
            <span>Not Answered</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-theme-focus-ring bg-transparent" aria-hidden="true" />
            <span>Current</span>
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 sm:p-4 border-b border-theme-border flex flex-wrap gap-2 items-center text-xs sm:text-sm">
          <span className="font-bold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" aria-hidden="true" /> Filter Section:
          </span>
          <select
            value={activeSectionFilter}
            onChange={(e) => handleSectionFilterChange(e.target.value)}
            aria-label="Filter questions by exam section"
            className="px-2.5 py-1.5 rounded border-2 border-theme-border bg-theme-bg text-theme-text font-medium"
          >
            <option value="All">All Sections</option>
            {Array.from(new Set(questions.map((q) => q.section).filter(Boolean))).map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>

          <span className="font-bold ml-2">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value as 'all' | 'answered' | 'unanswered' | 'marked')}
            aria-label="Filter questions by completion status"
            className="px-2.5 py-1.5 rounded border-2 border-theme-border bg-theme-bg text-theme-text font-medium"
          >
            <option value="all">All Questions</option>
            <option value="answered">Answered Only</option>
            <option value="unanswered">Not Answered</option>
            <option value="marked">Marked for Review</option>
          </select>
        </div>

        {/* Grid of Questions */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div
            role="grid"
            aria-label="Questions overview grid"
            className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3"
          >
            {filteredQuestions.map((q) => {
              const originalIdx = questions.findIndex((item) => item.id === q.id);
              const isCurrent = originalIdx === currentIndex;
              const isAnswered = selectedOptions[q.id] !== undefined;
              const isMarked = !!markedForReview[q.id];

              let statusLabel = 'Not answered';
              if (isAnswered && isMarked) statusLabel = `Answered Option ${selectedOptions[q.id]}, and marked for review`;
              else if (isAnswered) statusLabel = `Answered Option ${selectedOptions[q.id]}`;
              else if (isMarked) statusLabel = 'Marked for review';

              const spokenLabel = `Question ${q.questionNumber}, ${q.section}, ${statusLabel}${
                isCurrent ? ', Current Question' : ''
              }.`;

              const accessibleLabel = `${spokenLabel} Click to navigate.`;

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => jumpToQuestion(originalIdx)}
                  onFocus={() => {
                    useAnnouncerStore.getState().announce(spokenLabel, 'assertive', true, true);
                  }}
                  onMouseEnter={() => {
                    useAnnouncerStore.getState().announce(spokenLabel, 'assertive', true, true);
                  }}
                  aria-label={accessibleLabel}
                  className={`relative p-3 rounded-lg border-2 font-bold text-base sm:text-lg flex flex-col items-center justify-center transition cursor-pointer ${
                    isCurrent
                      ? 'border-theme-focus-ring ring-4 ring-theme-focus-ring/40 font-black'
                      : 'border-theme-border'
                  } ${
                    isMarked
                      ? 'bg-amber-500/30 text-theme-text'
                      : isAnswered
                      ? 'bg-emerald-600/30 text-theme-text'
                      : 'bg-theme-bg text-theme-text hover:bg-theme-surface'
                  }`}
                >
                  <span>Q{q.questionNumber}</span>
                  <div className="flex gap-1 mt-1">
                    {isAnswered && (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 fill-current" aria-hidden="true" />
                    )}
                    {isMarked && (
                      <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-current" aria-hidden="true" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-theme-border bg-theme-bg flex justify-between items-center">
          <span className="text-xs text-theme-text-secondary">
            Tip: Press Enter on any question to jump to it.
          </span>
          <button
            type="button"
            onClick={() => setPaletteOpen(false)}
            className="px-5 py-2 font-bold rounded-lg border-2 border-theme-border bg-theme-surface hover:bg-theme-bg text-theme-text"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
