import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { soundEffects } from '../../utils/soundEffects';
import { EXAM_CATEGORIES } from '../../data/examCategories';
import type { Exam } from '../../../shared/types';
import type { ExamCategory } from '../../data/examCategories';
import {
  Trophy,
  Lightbulb,
  Compass,
  Filter,
  Search,
  Volume2,
  ShieldCheck,
  Keyboard,
  Sparkles,
  WifiOff,
} from 'lucide-react';

export const ExamCatalogScreen: React.FC = () => {
  const {
    portalTab,
    setPortalTab,
    availableExams,
    availablePracticeDrills,
    selectExam,
    isCatalogLoading,
    catalogError,
    loadCatalog,
  } = useExamStore();
  const { announce, stopSpeech } = useAnnouncerStore();

  const [selectedCategory, setSelectedCategory] = useState<ExamCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  // Current active list based on selected portal tab
  const activeExamsList = portalTab === 'exams' ? availableExams : availablePracticeDrills;

  // Filter exams based on category and search query
  const filteredExams = useMemo(() => {
    return activeExamsList.filter((exam) => {
      const matchesCategory =
        selectedCategory === 'All' || exam.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exam.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exam.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exam.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeExamsList, selectedCategory, searchQuery]);

  // Spoken arrival orientation and voice suggestions for visually impaired candidates
  const hasAnnouncedCatalogRef = useRef<boolean>(false);
  useEffect(() => {
    if (!hasAnnouncedCatalogRef.current && activeExamsList.length > 0 && !isCatalogLoading) {
      hasAnnouncedCatalogRef.current = true;
      const count = activeExamsList.length;
      const topNames = activeExamsList.slice(0, 2).map((e) => e.title).join(', ');
      const msg = `Examination Catalog. ${count} ${
        portalTab === 'practice' ? 'practice drills' : 'mock examinations'
      } available, including ${topNames}. Say "Start" followed by any test name to begin, or use arrow keys and press Enter. Press N for notifications, or V for voice assistant.`;
      
      const timer = setTimeout(() => {
        announce(msg, 'polite', true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [activeExamsList, isCatalogLoading, portalTab, announce]);

  // Reset focus when tab or filter changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [portalTab, selectedCategory]);

  // Keep focused index within bounds
  useEffect(() => {
    if (focusedIndex >= filteredExams.length && filteredExams.length > 0) {
      setFocusedIndex(0);
    }
  }, [filteredExams.length, focusedIndex]);

  const handleCategoryChange = (cat: ExamCategory) => {
    setSelectedCategory(cat);
    soundEffects.playSelect();
    const count =
      cat === 'All'
        ? activeExamsList.length
        : activeExamsList.filter((e) => e.category === cat).length;
    announce(
      `Filter category changed to ${cat}. Showing ${count} ${
        portalTab === 'practice' ? 'practice drill' : 'examination'
      }${count === 1 ? '' : 's'}.`,
      'polite',
      true
    );
  };

  const handleCycleCategory = () => {
    const currentIdx = EXAM_CATEGORIES.indexOf(selectedCategory);
    const nextIdx = (currentIdx + 1) % EXAM_CATEGORIES.length;
    handleCategoryChange(EXAM_CATEGORIES[nextIdx]);
  };

  const handleTogglePortalTab = () => {
    const nextTab = portalTab === 'exams' ? 'practice' : 'exams';
    setPortalTab(nextTab);
  };

  const handleListenOverview = (exam: Exam) => {
    soundEffects.playSelect();
    const isPractice = portalTab === 'practice';
    const overview = `${isPractice ? 'Practice Drill' : 'Examination'}: ${exam.title}, Code ${exam.code}. Category: ${exam.category}. Difficulty: ${exam.difficulty}. Total questions: ${exam.questionCount}. Duration: ${exam.durationMinutes} minutes. ${
      isPractice
        ? 'Hints and step-by-step solutions are enabled.'
        : `Maximum marks: ${exam.totalMarks}. Negative marking: ${exam.negativeMarking}.`
    } Sections included: ${exam.sections.join(', ')}. Description: ${exam.description}. Press Enter to start.`;
    announce(overview, 'assertive', true);
  };

  const handleStartExam = (exam: Exam) => {
    stopSpeech();
    void selectExam(exam.id, portalTab === 'practice' ? 'practice' : 'exam');
  };

  // Announce focused exam details
  const announceExamCard = (index: number) => {
    const exam = filteredExams[index];
    if (!exam) return;
    const isPractice = portalTab === 'practice';
    const msg = `${isPractice ? 'Practice Drill' : 'Exam'} ${index + 1} of ${filteredExams.length}: ${exam.title}. Code ${exam.code}. Duration ${exam.durationMinutes} minutes. ${exam.questionCount} questions. Difficulty ${exam.difficulty}. ${
      isPractice ? 'Hints and Solutions available.' : ''
    } Press Enter to start, or O to hear overview.`;
    announce(msg, 'polite', true);
  };

  // Move focus to a specific card
  const focusCard = (index: number, speak = true) => {
    if (index >= 0 && index < filteredExams.length) {
      setFocusedIndex(index);
      cardRefs.current[index]?.focus();
      soundEffects.playNavigate();
      if (speak) {
        announceExamCard(index);
      }
    }
  };

  // Keyboard navigation listener for the Catalog Screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const store = useExamStore.getState();
      // If full modal dialogs are open, or not in catalog view, DO NOT intercept keys
      if (
        store.isSettingsOpen ||
        store.isShortcutsOpen ||
        store.activeView !== 'catalog' ||
        useNotificationStore.getState().isOpen ||
        Boolean(useNotificationStore.getState().activeNotification)
      ) {
        return;
      }

      const activeEl = document.activeElement;
      const isTyping =
        activeEl &&
        ((activeEl.tagName === 'INPUT' &&
          ['text', 'search', 'password', 'email', 'tel', 'url', 'number'].includes(
            ((activeEl as HTMLInputElement).type || 'text').toLowerCase()
          )) ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      // Slash '/' focuses the search box (when not already typing)
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
        announce(
          `Search box focused. Type to filter ${portalTab === 'practice' ? 'practice drills' : 'examinations'}, or press Escape to return.`,
          'polite',
          true
        );
        return;
      }

      // Escape from search box returns focus to the active exam card
      if (e.key === 'Escape' && isTyping) {
        e.preventDefault();
        searchInputRef.current?.blur();
        focusCard(focusedIndex, false);
        return;
      }

      // If user is actively typing in the search box, let native typing happen
      if (isTyping) return;

      // 't' or 'T' toggles portal mode (Mock Exams ⇄ Practice Arena)
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        handleTogglePortalTab();
        return;
      }

      // 'c' or 'C' cycles through categories
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleCycleCategory();
        return;
      }

      // 'o' or 'O' reads overview of currently focused exam
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        if (filteredExams[focusedIndex]) {
          handleListenOverview(filteredExams[focusedIndex]);
        }
        return;
      }

      // Arrow Down or Arrow Right: Next exam card
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = (focusedIndex + 1) % filteredExams.length;
        focusCard(next, true);
        return;
      }

      // Arrow Up or Arrow Left: Previous exam card
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = (focusedIndex - 1 + filteredExams.length) % filteredExams.length;
        focusCard(prev, true);
        return;
      }

      // Enter: Start the focused examination / drill
      if (e.key === 'Enter') {
        if (filteredExams[focusedIndex]) {
          e.preventDefault();
          handleStartExam(filteredExams[focusedIndex]);
        }
        return;
      }

      // Number keys '1' to '9': Quick jump to exam
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= filteredExams.length) {
        e.preventDefault();
        focusCard(num - 1, true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, filteredExams, selectedCategory, portalTab]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-[1700px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-32 focus:outline-none"
      aria-label={
        portalTab === 'practice'
          ? 'Practice Arena and Topic Drills Portal'
          : 'Examination Catalog and Test Series Selection'
      }
    >
      <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
        {/* Left Column: Accessible Navigation & Mode Sidebar */}
        <aside
          className="w-full lg:w-64 xl:w-72 shrink-0 space-y-3.5 lg:sticky lg:top-[104px]"
          aria-label="Portal Navigation and Filters Sidebar"
        >
          {/* 1. Portal Mode Switcher Card (Mock Exams vs Practice Arena) */}
          <div className="p-3.5 rounded-2xl bg-theme-surface border-2 border-theme-border shadow-sm space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-theme-border">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-theme-primary" aria-hidden="true" />
                <h2 className="text-xs font-black tracking-wider uppercase text-theme-text-secondary">
                  Portal Mode
                </h2>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-theme-border bg-theme-bg font-mono font-bold text-theme-text-secondary">
                Shortcut: T
              </span>
            </div>

            <div
              role="tablist"
              aria-label="Portal Section Selector. Press T to switch between Mock Exams and Practice Arena."
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2"
            >
              {/* Mock Examinations Tab */}
              <button
                type="button"
                role="tab"
                id="tab-mock-exams"
                aria-selected={portalTab === 'exams'}
                aria-controls="panel-exam-catalog"
                onClick={() => setPortalTab('exams')}
                className={`w-full p-2.5 rounded-xl font-bold text-left transition-all duration-200 border-2 focus:outline-none focus:ring-4 focus:ring-theme-focus ${
                  portalTab === 'exams'
                    ? 'border-theme-primary bg-theme-primary text-theme-primary-text shadow-md scale-[1.01]'
                    : 'border-theme-border bg-theme-surface hover:bg-theme-surface-elevated text-theme-text'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <Trophy
                      className={`w-3.5 h-3.5 ${portalTab === 'exams' ? 'text-yellow-300' : 'text-amber-500'}`}
                      aria-hidden="true"
                    />
                    <span className="text-xs sm:text-sm font-black leading-tight">Mock Examinations</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-black ${
                      portalTab === 'exams'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-theme-border/60 text-theme-text'
                    }`}
                  >
                    {availableExams.length} Tests
                  </span>
                </div>
                <p
                  className={`text-[11px] leading-snug font-medium ${
                    portalTab === 'exams' ? 'text-theme-primary-text' : 'text-theme-text-secondary'
                  }`}
                >
                  Timed Simulation Tests
                </p>
              </button>

              {/* Practice Arena Tab */}
              <button
                type="button"
                role="tab"
                id="tab-practice-arena"
                aria-selected={portalTab === 'practice'}
                aria-controls="panel-exam-catalog"
                onClick={() => setPortalTab('practice')}
                className={`w-full p-2.5 rounded-xl font-bold text-left transition-all duration-200 border-2 focus:outline-none focus:ring-4 focus:ring-theme-focus ${
                  portalTab === 'practice'
                    ? 'border-theme-primary bg-theme-primary text-theme-primary-text shadow-md scale-[1.01]'
                    : 'border-theme-border bg-theme-surface hover:bg-theme-surface-elevated text-theme-text'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <Lightbulb
                      className={`w-3.5 h-3.5 ${portalTab === 'practice' ? 'text-yellow-200' : 'text-emerald-500'}`}
                      aria-hidden="true"
                    />
                    <span className="text-xs sm:text-sm font-black leading-tight">Practice Arena</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-black ${
                      portalTab === 'practice'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-theme-border/60 text-theme-text'
                    }`}
                  >
                    {availablePracticeDrills.length} Drills
                  </span>
                </div>
                <p
                  className={`text-[11px] leading-snug font-medium ${
                    portalTab === 'practice' ? 'text-theme-primary-text' : 'text-theme-text-secondary'
                  }`}
                >
                  Hints &amp; Step-by-Step Solutions
                </p>
              </button>
            </div>
          </div>

          {/* 2. Subject / Category Filter in Sidebar */}
          <div className="p-3.5 rounded-2xl bg-theme-surface border-2 border-theme-border shadow-sm space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-theme-border">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-theme-primary" aria-hidden="true" />
                <h2 className="text-xs font-black tracking-wider uppercase text-theme-text-secondary">
                  Subject Filter
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-theme-border bg-theme-bg font-mono font-bold text-theme-text-secondary">
                  C
                </span>
                {selectedCategory !== 'All' && (
                  <button
                    type="button"
                    onClick={() => handleCategoryChange('All')}
                    className="text-xs font-bold text-theme-primary hover:underline ml-1"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div
              role="radiogroup"
              aria-label="Filter by subject category (Press C to cycle)"
              tabIndex={0}
              className="flex flex-row overflow-x-auto no-scrollbar gap-1.5 pb-1 lg:flex-col lg:space-y-0.5 lg:overflow-visible focus:outline-none focus:ring-2 focus:ring-theme-primary/50 rounded-xl"
            >
              {EXAM_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                const count =
                  cat === 'All'
                    ? activeExamsList.length
                    : activeExamsList.filter((e) => e.category === cat).length;

                return (
                  <button
                    key={cat}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleCategoryChange(cat)}
                    className={`w-auto shrink-0 whitespace-nowrap lg:w-full px-2.5 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-between gap-2 transition-all focus:outline-none focus:ring-4 focus:ring-theme-focus ${
                      isSelected
                        ? portalTab === 'practice'
                          ? 'bg-emerald-600/15 border-emerald-600 text-theme-text font-black shadow-xs'
                          : 'bg-theme-primary/15 border-theme-primary text-theme-text font-black shadow-xs'
                        : 'border-transparent text-theme-text hover:bg-theme-surface-elevated'
                    }`}
                  >
                    <span className="truncate">{cat}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                        isSelected
                          ? portalTab === 'practice'
                            ? 'bg-theme-primary text-theme-primary-text'
                            : 'bg-theme-primary text-theme-primary-text'
                          : 'bg-theme-border/60 text-theme-text-secondary'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Audio Guide & Accessibility Helper Card */}
          <div className="p-3 rounded-2xl bg-theme-surface border-2 border-theme-border shadow-sm space-y-2">
            <button
              type="button"
              onClick={() => {
                announce(
                  portalTab === 'practice'
                    ? `Welcome to Practice Arena. There are ${availablePracticeDrills.length} practice drills available across Quantitative, Reasoning, Verbal, General Awareness, and Data Interpretation. Hints and step-by-step solutions are available on every question. Press Arrow keys to cycle, Enter to start, or T to switch back to Mock Exams.`
                    : `Welcome to Examination Portal. There are ${availableExams.length} timed simulation tests. Press Arrow keys to cycle, Enter to start, or T to switch to Practice Arena.`,
                  'assertive',
                  true
                );
              }}
              className="w-full py-2 px-3 rounded-xl border-2 border-theme-primary bg-theme-surface hover:bg-theme-primary/10 text-theme-primary font-bold text-xs flex items-center justify-center gap-2 transition-colors focus:ring-4 focus:ring-theme-focus"
              aria-label="Listen portal navigation instructions"
            >
              <Volume2 className="w-4 h-4" aria-hidden="true" />
              <span>Section Audio Guide</span>
            </button>

            <div className="py-1.5 px-2.5 rounded-xl bg-theme-bg border border-theme-border flex items-center gap-2 text-xs">
              <ShieldCheck className="w-4 h-4 text-theme-success shrink-0" aria-hidden="true" />
              <span className="font-semibold text-theme-text-secondary text-[11px]">
                100% WCAG 2.1 AA Compliant
              </span>
            </div>
          </div>
        </aside>

        {/* Right Column: Main Examination / Drill Cards & Search */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          {/* Welcome / Mode Banner */}
          <section
            className={`p-5 sm:p-6 rounded-2xl bg-theme-surface border-2 shadow-sm transition-all ${
              portalTab === 'practice'
                ? 'border-emerald-600/50 bg-emerald-500/5'
                : 'border-theme-border'
            }`}
            aria-labelledby="catalog-heading"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-xs font-black bg-theme-primary/10 text-theme-primary border border-theme-primary/30">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {portalTab === 'practice'
                      ? 'Interactive Practice Drills'
                      : 'Full-Length Simulation Tests'}
                  </span>
                </div>
                {portalTab === 'practice' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    <WifiOff className="w-3 h-3" aria-hidden="true" />
                    100% Offline Ready (IndexedDB Cached)
                  </span>
                )}
              </div>
              <h1
                id="catalog-heading"
                className="text-2xl sm:text-3xl font-black tracking-tight text-theme-text mb-1.5"
              >
                {portalTab === 'practice'
                  ? 'Interactive Practice Arena'
                  : 'Examination & Mock Test Series'}
              </h1>
              <p className="text-sm text-theme-text-secondary font-medium leading-relaxed max-w-3xl">
                {portalTab === 'practice' ? (
                  <>
                    Sharpen your concepts topic-by-topic. Includes instant{' '}
                    <strong className="text-theme-marked font-bold">Helpful Hints</strong> and{' '}
                    <strong className="text-theme-success font-bold">Step-by-Step Solutions</strong> with no timer pressure.
                  </>
                ) : (
                  <>
                    Simulate real exam conditions with strict timers and negative marking. Designed for screen readers, keyboard-only operators, and low-vision candidates.
                  </>
                )}
              </p>
            </div>
          </section>

          {/* Search Bar + Keyboard Shortcuts Bar (Side-by-Side) */}
          <section
            id="panel-exam-catalog"
            role="region"
            aria-label={`Search and Filter ${portalTab === 'practice' ? 'Practice Drills' : 'Examinations'}`}
            className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 w-full"
          >
            {/* Search Input Box */}
            <div className="relative w-full lg:w-72 xl:w-80 shrink-0">
              <label htmlFor="exam-search-input" className="sr-only">
                Search {portalTab === 'practice' ? 'practice drills' : 'examinations'} by title, code, or keyword (Press slash to focus)
              </label>
              <input
                ref={searchInputRef}
                id="exam-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${portalTab === 'practice' ? 'practice topics' : 'mock tests'} (Press /)...`}
                className="w-full h-11 px-4 pl-10 pr-16 rounded-xl bg-theme-surface border-2 border-theme-border text-theme-text placeholder:text-theme-text-secondary focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none font-medium text-sm transition-all"
              />
              <Search
                className="w-4 h-4 absolute left-3 top-3.5 text-theme-text-secondary pointer-events-none"
                aria-hidden="true"
              />
              <div className="absolute right-2.5 top-2.5 flex items-center gap-1">
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="text-xs px-2 py-0.5 rounded bg-theme-border text-theme-text hover:bg-theme-primary hover:text-theme-primary-text"
                    aria-label="Clear search query"
                  >
                    Clear
                  </button>
                ) : (
                  <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-theme-border bg-theme-bg text-theme-text-secondary font-mono font-bold">
                    /
                  </kbd>
                )}
              </div>
            </div>

            {/* Keyboard Shortcuts Reference Bar (Side of Search Bar) */}
            <nav
              aria-label="Catalog Quick Keyboard Shortcuts"
              className="flex-1 min-w-0 h-auto sm:h-11 px-3.5 py-2 rounded-xl bg-theme-surface border-2 border-theme-border flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-sm"
            >
              <div className="flex items-center gap-1.5 font-bold text-theme-text shrink-0">
                <Keyboard className="w-4 h-4 text-theme-primary" aria-hidden="true" />
                <span className="hidden sm:inline">Shortcuts:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-theme-text-secondary font-medium">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-theme-border bg-theme-bg font-mono font-bold text-theme-text text-[10px]">T</kbd>
                  <span className="text-[11px]">Mode</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-theme-border bg-theme-bg font-mono font-bold text-theme-text text-[10px]">↑/↓</kbd>
                  <span className="text-[11px]">Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-theme-border bg-theme-bg font-mono font-bold text-theme-text text-[10px]">Enter</kbd>
                  <span className="text-[11px]">Start</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-theme-border bg-theme-bg font-mono font-bold text-theme-text text-[10px]">O</kbd>
                  <span className="text-[11px]">Overview</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-theme-border bg-theme-bg font-mono font-bold text-theme-text text-[10px]">C</kbd>
                  <span className="text-[11px]">Category</span>
                </span>
              </div>

              {/* Showing Count */}
              <div
                className="text-xs font-bold text-theme-text-secondary shrink-0 pl-2 sm:border-l border-theme-border"
                aria-live="polite"
              >
                <span className="text-theme-primary font-black">{filteredExams.length}</span>/{activeExamsList.length} {portalTab === 'practice' ? 'Drills' : 'Tests'}
              </div>
            </nav>
          </section>

          {/* Grid of Cards with Full Keyboard Navigation */}
          <section
            aria-label={`${
              portalTab === 'practice' ? 'Practice Drills' : 'Examinations'
            } List. Use Arrow Keys to navigate, Enter to start`}
            className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full"
          >
            {filteredExams.length === 0 ? (
              <div className="col-span-full p-12 text-center rounded-2xl bg-theme-surface border-2 border-dashed border-theme-border">
                {isCatalogLoading ? (
                  <>
                    <div
                      aria-hidden="true"
                      className="w-10 h-10 mx-auto mb-4 rounded-full border-4 border-theme-border border-t-theme-primary animate-spin"
                    />
                    <h2 className="text-xl font-bold text-theme-text mb-2">
                      Loading Examinations
                    </h2>
                    <p className="text-sm text-theme-text-secondary" role="status" aria-live="polite">
                      Fetching the examination catalog. This will only take a moment.
                    </p>
                  </>
                ) : catalogError ? (
                  <>
                    <span className="text-4xl mb-3 block" aria-hidden="true">
                      📡
                    </span>
                    <h2 className="text-xl font-bold text-theme-text mb-2">
                      Cannot Load the Examination Catalog
                    </h2>
                    <p className="text-sm text-theme-text-secondary mb-1 max-w-lg mx-auto">
                      {catalogError}
                    </p>
                    <p className="text-sm text-theme-text-secondary mb-4 max-w-lg mx-auto">
                      The catalog lives on the DristiX server. Make sure the backend is running
                      (<code className="font-mono">cd server &amp;&amp; npm run dev</code>), then try
                      again. If your session expired, sign out and back in.
                    </p>
                    <button
                      type="button"
                      onClick={() => void loadCatalog()}
                      className="px-4 py-2 rounded-lg bg-theme-primary text-theme-primary-text font-bold text-sm focus:ring-4 focus:ring-theme-focus"
                    >
                      Retry
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-4xl mb-3 block" aria-hidden="true">
                      📑
                    </span>
                    <h2 className="text-xl font-bold text-theme-text mb-2">
                      No Modules Match Your Criteria
                    </h2>
                    <p className="text-sm text-theme-text-secondary mb-4">
                      {activeExamsList.length === 0
                        ? 'No examinations have been published yet. An administrator can add one from the Admin Studio.'
                        : 'Try adjusting your search query or selecting "All" categories.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('All');
                        setSearchQuery('');
                      }}
                      className="px-4 py-2 rounded-lg bg-theme-primary text-theme-primary-text font-bold text-sm focus:ring-4 focus:ring-theme-focus"
                    >
                      Reset Filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              filteredExams.map((exam, idx) => {
                const isFocused = focusedIndex === idx;
                const isPractice = portalTab === 'practice';
                const difficultyBadgeColor =
                  exam.difficulty === 'Easy'
                    ? 'bg-theme-success/15 text-theme-success border-theme-success/30 font-bold'
                    : exam.difficulty === 'Moderate'
                    ? 'bg-theme-marked/15 text-theme-marked border-theme-marked/30 font-bold'
                    : 'bg-theme-danger/15 text-theme-danger border-theme-danger/30 font-bold';

                return (
                  <article
                    key={exam.id}
                    ref={(el) => {
                      cardRefs.current[idx] = el;
                    }}
                    tabIndex={0}
                    onFocus={() => {
                      setFocusedIndex(idx);
                    }}
                    aria-labelledby={`exam-title-${exam.id}`}
                    aria-describedby={`exam-stats-${exam.id}`}
                    className={`flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-theme-surface border-2 overflow-hidden transition-all shadow-sm outline-none focus:ring-4 focus:ring-theme-focus cursor-pointer ${
                      isFocused
                        ? isPractice
                          ? 'border-emerald-600 ring-2 ring-emerald-600/30 shadow-md'
                          : 'border-theme-primary ring-2 ring-theme-primary/30 shadow-md'
                        : 'border-theme-border hover:border-theme-primary/70'
                    }`}
                  >
                    <div>
                      {/* Badges Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-6 h-6 rounded-full text-theme-primary-text text-xs font-black flex items-center justify-center font-mono bg-theme-primary">



                            {idx + 1}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-theme-border/60 text-theme-text tracking-wider uppercase">
                            {exam.code}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isPractice && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1"
                              title="100% available without active internet connection">
  
                              <WifiOff className="w-2.5 h-2.5" aria-hidden="true" />
                              Offline Ready
                            </span>
                          )}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${difficultyBadgeColor}`}>

                            {exam.difficulty}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-theme-border/40 text-theme-text border border-theme-border">
                            {exam.category}
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <h2
                        id={`exam-title-${exam.id}`}
                        className="text-xl font-bold text-theme-text mb-2 leading-snug"
                      >
                        {exam.title}
                      </h2>

                      {/* Description */}
                      <p className="text-sm text-theme-text-secondary font-medium mb-4 line-clamp-3 leading-relaxed">
                        {exam.description}
                      </p>

                      {/* Practice Specific Feature Callout */}
                      {isPractice && (
                        <div className="flex flex-wrap items-center gap-2 mb-3.5">
                          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <span>💡</span>
                            <span>Helpful Hints</span>
                          </span>
                          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <span>🔍</span>
                            <span>Step-by-Step Solutions</span>
                          </span>
                          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                            Self-Paced
                          </span>
                        </div>
                      )}

                      {/* Key Stats Bar */}
                      <div
                        id={`exam-stats-${exam.id}`}
                        className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2.5 px-3.5 mb-4 rounded-xl bg-theme-bg border border-theme-border text-xs"
                      >
                        <div>
                          <span className="text-theme-text-secondary font-semibold block text-xs">Duration</span>
                          <span className="font-extrabold text-theme-text">
                            ⏱️ {exam.durationMinutes} min
                          </span>
                        </div>
                        <div>
                          <span className="text-theme-text-secondary font-semibold block text-xs">Questions</span>
                          <span className="font-extrabold text-theme-text">
                            ❓ {exam.questionCount} items
                          </span>
                        </div>
                        <div>
                          <span className="text-theme-text-secondary font-semibold block text-xs">Total Marks</span>
                          <span className="font-extrabold text-theme-text">
                            🏆 {exam.totalMarks} pts
                          </span>
                        </div>
                        <div>
                          <span className="text-theme-text-secondary font-semibold block text-xs">Mode</span>
                          <span className="font-extrabold text-theme-text truncate">
                            {isPractice ? '💡 Practice' : '⚠️ Timed'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-3 border-t border-theme-border">
                      <button
                        type="button"
                        onClick={() => handleStartExam(exam)}
                        className="flex-1 min-w-0 py-3 sm:py-2.5 px-3.5 min-h-[44px] rounded-xl bg-theme-primary text-theme-primary-text font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm hover:brightness-110 active:scale-[0.99] transition-all focus:outline-none focus:ring-4 focus:ring-theme-focus"


                        aria-label={`Start ${isPractice ? 'Practice Drill' : 'Examination'}: ${exam.title} (Or press Enter)`}
                      >
                        <span className="shrink-0">{isPractice ? '💡' : '🚀'}</span>
                        <span className="truncate">{isPractice ? 'Start Practice Drill' : 'Start Examination'}</span>
                        <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 border border-current/30 rounded bg-black/10 uppercase font-mono shrink-0">
                          Enter
                        </kbd>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleListenOverview(exam)}
                        className="shrink-0 py-3 sm:py-2.5 px-3.5 min-h-[44px] rounded-xl bg-theme-surface border-2 border-theme-border hover:border-theme-primary text-theme-text font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus:ring-4 focus:ring-theme-focus"
                        aria-label={`Listen overview for ${exam.title} (Or press O)`}
                      >
                        <span className="shrink-0">🔊</span>
                        <span className="shrink-0">Overview</span>
                        <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 border border-theme-border rounded bg-theme-bg font-mono shrink-0">
                          O
                        </kbd>
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </div>
      </div>
    </main>
  );
};
