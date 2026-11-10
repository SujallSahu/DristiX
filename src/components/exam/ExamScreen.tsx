import React, { useEffect, useRef, useState } from 'react';
import { useExamStore } from '../../store/useExamStore';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { MathEquation } from '../common/MathEquation';
import {
  Bookmark,
  CheckCircle,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  BookOpen,
  Hash,
} from 'lucide-react';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { speechEngine } from '../../utils/speechEngine';
import { AiDiagramViewer } from '../common/AiDiagramViewer';
import { InteractiveSonificationGraph } from '../sonification/InteractiveSonificationGraph';
import { verbalizeForSpeech, verbalizeMath } from '../../utils/mathVerbalizer';

export const ExamScreen: React.FC = () => {
  const {
    questions,
    currentIndex,
    selectedOptions,
    markedForReview,
    examMode,
    nextQuestion,
    previousQuestion,
    selectOption,
    clearOption,
    toggleMarkForReview,
    setSubmitModalOpen,
    announceCurrentQuestion,
  } = useExamStore();

  const currentQ = questions[currentIndex];
  const qHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedOptNum = currentQ ? selectedOptions[currentQ.id] : undefined;
  const isMarked = currentQ ? !!markedForReview[currentQ.id] : false;

  // Practice mode states
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  // Reset hint/solution when question changes
  useEffect(() => {
    setShowHint(false);
    setShowSolution(false);
  }, [currentIndex]);

  // PROGRAMMATIC FOCUS SHIFT: Focus shifts to question heading immediately on navigation & reads aloud
  useEffect(() => {
    if (qHeadingRef.current) {
      qHeadingRef.current.focus({ preventScroll: false });
    }

    // Suppress redundant autoRead when voice assistant is announcing the question directly
    const { suppressAutoRead, setSuppressAutoRead } = useExamStore.getState();
    if (suppressAutoRead) {
      setSuppressAutoRead(false);
      return;
    }

    const autoRead = usePreferencesStore.getState().autoReadOnNavigate;
    if (!autoRead || !currentQ) return;

    let finished = false;
    let unbind: (() => void) | null = null;

    const read = (afterWaiting: boolean) => {
      if (finished) return;
      finished = true;
      if (unbind) {
        unbind();
        unbind = null;
      }
      if (afterWaiting && speechEngine.wasInterrupted()) return;
      announceCurrentQuestion(true);
    };

    if (speechEngine.isSpeaking()) {
      unbind = speechEngine.onSpeechEnd(() => read(true));
      const fallback = window.setTimeout(() => read(true), 15000);
      return () => {
        window.clearTimeout(fallback);
        finished = true;
        if (unbind) unbind();
      };
    }

    read(false);
    return () => {
      finished = true;
    };
  }, [currentIndex]);

  if (!currentQ) {
    return (
      <main className="max-w-4xl mx-auto p-8 text-center text-theme-text">
        <div className="p-8 rounded-2xl bg-theme-surface border-2 border-theme-border shadow-md">
          <h2 className="text-xl font-bold mb-2">No Questions Found</h2>
          <p className="text-sm text-theme-text/80 mb-6">
            This examination does not contain any questions or the index is out of bounds.
          </p>
          <button
            type="button"
            onClick={() => useExamStore.getState().returnToCatalog()}
            className="px-6 py-2.5 font-bold rounded-xl bg-theme-primary text-theme-primary-text hover:brightness-110 transition"
          >
            Return to Examination Catalog
          </button>
        </div>
      </main>
    );
  }

  const handleOptionChange = (optionNumber: number) => {
    selectOption(optionNumber);
  };

  const handleToggleHint = () => {
    const next = !showHint;
    setShowHint(next);
    useAnnouncerStore.getState().announce(
      next ? `Hint opened: ${currentQ.hint}` : 'Hint closed.',
      'polite',
      true
    );
  };

  const handleToggleSolution = () => {
    const next = !showSolution;
    setShowSolution(next);
    useAnnouncerStore.getState().announce(
      next ? `Solution opened: ${currentQ.explanation}` : 'Solution closed.',
      'polite',
      true
    );
  };

  const isLastQuestion = currentIndex === questions.length - 1;

  // Progress percentage
  const progressPct = Math.round(((currentIndex + 1) / questions.length) * 100);
  const answeredCount = Object.keys(selectedOptions).length;

  return (
    <main
      id="main-question-content"
      role="main"
      tabIndex={-1}
      className="outline-none"
    >
      {/* ── Progress Bar ── */}
      <div className="mb-4" aria-hidden="true">
        <div className="flex justify-between items-center text-xs font-semibold text-theme-text-secondary mb-1.5">
          <span>Question {currentQ.questionNumber} of {questions.length}</span>
          <span>{answeredCount} of {questions.length} answered</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-theme-border overflow-hidden">
          <div
            className="h-full rounded-full bg-theme-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── Main Question Card ── */}
      <section
        aria-labelledby="q-heading"
        className="bg-theme-surface border border-theme-border rounded-2xl shadow-md overflow-hidden"
      >

        {/* Card Top Bar: Section + Status + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-2.5 sm:py-3 border-b border-theme-border bg-theme-bg/60">

          {/* Left: Section pill + status badges */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-theme-border bg-theme-surface text-theme-text-secondary">
              <Hash className="w-3 h-3" aria-hidden="true" />
              {currentQ.section}
            </span>

            {isMarked && (
              <span
                role="status"
                className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400"
              >
                <Bookmark className="w-3 h-3 fill-current" aria-hidden="true" />
                Marked
              </span>
            )}

            {selectedOptNum && (
              <span
                role="status"
                className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              >
                <CheckCircle className="w-3 h-3" aria-hidden="true" />
                Opt {selectedOptNum} Selected
              </span>
            )}
          </div>

          {/* Right: Speak / Stop buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                announceCurrentQuestion(true);
              }}
              title="Read this question and all options aloud (Shortcut: R)"
              aria-label={`Read Question ${currentQ.questionNumber} and options aloud (Shortcut: R)`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-primary text-theme-primary-text hover:brightness-110 font-bold text-xs transition shadow-sm cursor-pointer active:scale-95"
            >
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Speak <kbd className="font-mono opacity-70">(R)</kbd></span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                useAnnouncerStore.getState().stopSpeech();
              }}
              title="Stop voice immediately (Shortcut: S or Esc)"
              aria-label="Stop voice reading (Shortcut: S or Esc)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-theme-border bg-theme-bg hover:bg-theme-surface text-theme-text font-bold text-xs transition cursor-pointer active:scale-95"
            >
              <VolumeX className="w-3.5 h-3.5 text-theme-danger" aria-hidden="true" />
              <span>Stop <kbd className="font-mono opacity-70">(S)</kbd></span>
            </button>
          </div>
        </div>

        {/* ── Question Body ── */}
        <div className="px-3.5 sm:px-6 pt-4 sm:pt-5 pb-2">

          {/* Q-number + Question Text */}
          <h2
            id="q-heading"
            ref={qHeadingRef}
            tabIndex={-1}
            onClick={() => announceCurrentQuestion(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                announceCurrentQuestion(true);
              }
            }}
            title="Click or press Space/Enter to read aloud"
            className="text-lg sm:text-xl lg:text-2xl font-bold text-theme-text leading-relaxed outline-none focus:ring-0 focus-visible:ring-4 focus-visible:ring-theme-focus-ring rounded-lg cursor-pointer hover:opacity-90 transition"
          >
            <span className="text-theme-primary font-black mr-2">
              Q{currentQ.questionNumber}.
            </span>
            {currentQ.questionText}
          </h2>

          {/* Math equation if present */}
          {currentQ.mathLatex && (
            <div
              tabIndex={0}
              role="region"
              aria-label="Mathematical formula container"
              className="mt-4 p-4 rounded-xl bg-theme-bg border border-theme-border inline-block max-w-full overflow-x-auto focus:outline-none focus:ring-2 focus:ring-theme-primary/50"
            >
              <MathEquation
                latex={currentQ.mathLatex}
                displayMode={true}
                className="text-lg sm:text-xl font-semibold"
              />
            </div>
          )}

          {/* Sonification graph */}
          {currentQ.graph && currentQ.graph.enabled && (
            <InteractiveSonificationGraph graph={currentQ.graph} />
          )}

          {/* AI Diagram */}
          <AiDiagramViewer question={currentQ} />
        </div>

        {/* ── Answer Options ── */}
        <fieldset id="answer-options-group" className="px-3.5 sm:px-6 pb-4 pt-3">
          <legend className="sr-only">
            Answer Options for Question {currentQ.questionNumber}. Use keyboard keys 1, 2, 3, 4 to select options directly.
          </legend>

          <div className="space-y-2.5">
            {currentQ.options.map((option, idx) => {
              const isSelected = selectedOptNum === option.number;
              const inputId = `option_${currentQ.id}_${option.number}`;
              const optionLetters = ['A', 'B', 'C', 'D', 'E'];
              const letter = optionLetters[idx] ?? String(option.number);

              return (
                <label
                  key={option.id}
                  htmlFor={inputId}
                  className={`group flex items-center gap-3.5 p-3.5 sm:p-4 border-2 rounded-xl cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'border-theme-primary bg-theme-primary/10 shadow-sm'
                      : 'border-theme-border bg-theme-bg/50 hover:border-theme-primary/50 hover:bg-theme-surface'
                  }`}
                >
                  {/* Hidden radio for accessibility */}
                  <input
                    type="radio"
                    id={inputId}
                    name={`question_${currentQ.id}`}
                    value={option.id}
                    checked={isSelected}
                    onChange={() => handleOptionChange(option.number)}
                    className="sr-only"
                    aria-label={`Option ${option.number}: ${verbalizeForSpeech(
                      option.mathLatex && option.text && option.text.trim().toLowerCase() === verbalizeMath(option.mathLatex).trim().toLowerCase()
                        ? verbalizeMath(option.mathLatex)
                        : option.mathLatex
                          ? `${option.text}, ${verbalizeMath(option.mathLatex)}`
                          : option.text
                    )}`}
                  />

                  {/* Letter bubble — acts as visual radio */}
                  <span
                    aria-hidden="true"
                    className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-black transition-all ${
                      isSelected
                        ? 'border-theme-primary bg-theme-primary text-theme-primary-text shadow-sm'
                        : 'border-theme-border bg-theme-surface text-theme-text group-hover:border-theme-primary/60'
                    }`}
                  >
                    {isSelected ? <CheckCircle className="w-4 h-4" /> : letter}
                  </span>

                  {/* Option text */}
                  <span className={`flex-1 text-base sm:text-lg leading-snug transition-colors ${
                    isSelected ? 'text-theme-text font-semibold' : 'text-theme-text'
                  }`}>
                    {(() => {
                      const mathVerbal = option.mathLatex ? verbalizeMath(option.mathLatex).trim().toLowerCase() : '';
                      const rawText = option.text ? option.text.trim() : '';
                      const isIdentical = mathVerbal && rawText.toLowerCase() === mathVerbal;

                      return (
                        <>
                          {(!isIdentical || !option.mathLatex) && option.text && (
                            <span>{option.text}</span>
                          )}
                          {option.mathLatex && (
                            <MathEquation
                              latex={option.mathLatex}
                              className={!isIdentical && option.text ? "ml-2 font-mono" : "font-mono"}
                            />
                          )}
                        </>
                      );
                    })()}
                  </span>

                  {/* Keyboard shortcut badge */}
                  <kbd
                    aria-hidden="true"
                    className={`hidden sm:flex flex-shrink-0 items-center justify-center w-6 h-6 text-xs font-mono font-bold rounded border transition-all ${
                      isSelected
                        ? 'border-theme-primary/50 bg-theme-primary/20 text-theme-primary'
                        : 'border-theme-border bg-theme-bg text-theme-text-secondary group-hover:border-theme-primary/40'
                    }`}
                  >
                    {option.number}
                  </kbd>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* ── Practice Mode: Hint & Solution ── */}
        {examMode === 'practice' && (
          <div className="px-4 sm:px-6 pt-2 pb-5 border-t border-theme-border mt-2">
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={handleToggleHint}
                aria-expanded={showHint}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-sm hover:bg-amber-500/20 transition"
              >
                <Lightbulb className="w-4 h-4" aria-hidden="true" />
                {showHint ? 'Hide Hint' : 'Show Hint'}
              </button>

              <button
                type="button"
                onClick={handleToggleSolution}
                aria-expanded={showSolution}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-text font-bold text-sm hover:bg-theme-surface transition"
              >
                <BookOpen className="w-4 h-4 text-theme-primary" aria-hidden="true" />
                {showSolution ? 'Hide Solution' : 'View Solution'}
              </button>
            </div>

            {showHint && (
              <div
                role="region"
                aria-label="Question Hint"
                className="mt-3 p-4 rounded-xl border border-amber-500/50 bg-amber-500/8 text-theme-text text-sm sm:text-base"
              >
                <strong className="block text-amber-600 dark:text-amber-400 font-bold mb-1 flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4" aria-hidden="true" />
                  Helpful Formula / Concept
                </strong>
                {currentQ.hint}
              </div>
            )}

            {showSolution && (
              <div
                role="region"
                aria-label="Detailed Solution"
                className="mt-3 p-4 rounded-xl border border-emerald-500/50 bg-emerald-500/8 text-theme-text text-sm sm:text-base space-y-2"
              >
                <strong className="block text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  Correct Answer: Option {currentQ.correctOption} — {currentQ.options.find(o => o.number === currentQ.correctOption)?.text}
                </strong>
                <p className="leading-relaxed">{currentQ.explanation}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Navigation Controls ── */}
      <nav
        id="question-navigation-controls"
        aria-label="Question Navigation Controls"
        className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
      >
        {/* LEFT ON DESKTOP / ROW 2 ON MOBILE: Previous & Mobile Next */}
        <div className="flex items-center justify-between sm:justify-start gap-2.5 order-2 sm:order-1">
          <button
            id="btn-prev"
            type="button"
            onClick={() => previousQuestion()}
            disabled={currentIndex === 0}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-3 sm:py-2.5 min-h-[44px] font-bold rounded-xl border border-theme-border bg-theme-surface text-theme-text hover:bg-theme-bg disabled:opacity-35 disabled:cursor-not-allowed transition text-xs sm:text-sm"
            aria-label={`Go to previous question (Shortcut: Left Arrow or P). ${currentIndex === 0 ? 'Disabled — this is the first question.' : ''}`}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Previous <kbd className="font-mono opacity-60 text-xs hidden sm:inline">(←)</kbd></span>
          </button>

          {/* Mobile-only Next / Submit in Row 2 */}
          <div className="flex-1 sm:hidden">
            {isLastQuestion ? (
              <button
                type="button"
                onClick={() => setSubmitModalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] font-bold rounded-xl border-2 border-emerald-700 bg-emerald-700 hover:bg-emerald-800 text-white transition shadow-sm text-xs sm:text-sm"
                aria-label="Finish and submit exam (Shortcut: Alt+S)"
              >
                <span>Finish &amp; Submit</span>
                <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => nextQuestion()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] font-bold rounded-xl bg-theme-primary hover:brightness-110 text-theme-primary-text transition shadow-sm text-xs sm:text-sm"
                aria-label={`Go to next question (Shortcut: Right Arrow or N)`}
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* CENTER ON DESKTOP / ROW 1 ON MOBILE: Mark + Clear + Speak */}
        <div className="flex items-center justify-center sm:justify-start gap-2 order-1 sm:order-2">
          <button
            id="btn-mark"
            type="button"
            onClick={toggleMarkForReview}
            aria-pressed={isMarked}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 min-h-[44px] font-bold rounded-xl border-2 transition text-xs sm:text-sm ${
              isMarked
                ? 'border-amber-500 bg-amber-500 text-black'
                : 'border-theme-border bg-theme-surface text-theme-text hover:border-amber-500/50 hover:bg-amber-500/10'
            }`}
            aria-label={`${isMarked ? 'Unmark' : 'Mark'} question for review (Shortcut: M)`}
          >
            <Bookmark className={`w-4 h-4 shrink-0 ${isMarked ? 'fill-current' : ''}`} aria-hidden="true" />
            <span>{isMarked ? 'Marked' : 'Mark'} <kbd className={`font-mono text-xs opacity-60 hidden sm:inline ${isMarked ? 'text-black' : ''}`}>(M)</kbd></span>
          </button>

          {selectedOptNum && (
            <button
              id="btn-clear"
              type="button"
              onClick={() => clearOption()}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] font-bold rounded-xl border border-theme-border bg-theme-surface text-theme-text hover:bg-theme-bg hover:border-red-400/50 transition text-xs sm:text-sm"
              aria-label="Clear selected answer (Shortcut: C)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-theme-text-secondary shrink-0" aria-hidden="true" />
              <span>Clear <kbd className="font-mono text-xs opacity-60 hidden sm:inline">(C)</kbd></span>
            </button>
          )}

          {/* Speak icon-only button (redundant but discoverable) */}
          <button
            type="button"
            onClick={() => announceCurrentQuestion(true)}
            title="Read Question & Options Aloud (R)"
            aria-label="Read Question & Options Aloud (Shortcut: R)"
            className="p-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text hover:bg-theme-bg transition shrink-0"
          >
            <Volume2 className="w-4 h-4 text-theme-primary shrink-0" aria-hidden="true" />
          </button>
        </div>

        {/* RIGHT: Next or Submit (Desktop & Tablet) */}
        <div className="hidden sm:block order-3">
          {isLastQuestion ? (
            <button
              id="btn-submit"
              type="button"
              onClick={() => setSubmitModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 min-h-[44px] font-bold rounded-xl border-2 border-emerald-700 bg-emerald-700 hover:bg-emerald-800 text-white transition shadow-sm text-sm"
              aria-label="Finish and submit exam (Shortcut: Alt+S)"
            >
              <span>Finish &amp; Submit</span>
              <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          ) : (
            <button
              id="btn-next"
              type="button"
              onClick={() => nextQuestion()}
              className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 min-h-[44px] font-bold rounded-xl bg-theme-primary hover:brightness-110 text-theme-primary-text transition shadow-sm text-sm"
              aria-label={`Go to next question (Shortcut: Right Arrow or N)`}
            >
              <span>Next <kbd className="font-mono text-xs opacity-70">(→)</kbd></span>
              <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          )}
        </div>
      </nav>

      {/* ── Keyboard quick-reference strip ── */}
      <p
        aria-hidden="true"
        className="mt-3 text-center text-xs text-theme-text-secondary/60 font-mono tracking-wide select-none"
      >
        1–4 Select Option &nbsp;·&nbsp; R Speak &nbsp;·&nbsp; S Stop &nbsp;·&nbsp; M Mark &nbsp;·&nbsp; C Clear &nbsp;·&nbsp; ←/→ Navigate &nbsp;·&nbsp; P Palette
      </p>
    </main>
  );
};
