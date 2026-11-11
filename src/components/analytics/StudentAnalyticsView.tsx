import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  useAuthStore,
  getStudentDismissedIds,
  getStudentClearedTimestamp,
  deduplicateSubmissions,
  matchesStudent,
} from '../../store/useAuthStore';
import { useExamStore, computeAnalyticsSnapshot } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import {
  Award,
  TrendingUp,
  Trash2,
  Clock,
  ArrowLeft,
  Volume2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Search,
  RotateCcw,
  Target,
  Sparkles,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface StudentAnalyticsViewProps {
  onReturnToCatalog: () => void;
}

export const StudentAnalyticsView: React.FC<StudentAnalyticsViewProps> = ({ onReturnToCatalog }) => {
  const { currentStudent, submissions, syncSubmissions } = useAuthStore();

  // Pull the latest results from the server whenever this view opens, and keep synchronized
  // with cross-tab submissions, focus events, and live background polling.
  useEffect(() => {
    void syncSubmissions();
    void useExamStore.getState().loadCatalog();

    const handleRefresh = () => {
      void syncSubmissions();
      void useExamStore.getState().loadCatalog();
    };

    window.addEventListener('dristix:submission-updated', handleRefresh);
    window.addEventListener('dristix:submission-deleted', handleRefresh);
    window.addEventListener('dristix:submission-cleared', handleRefresh);
    window.addEventListener('focus', handleRefresh);

    const pollInterval = setInterval(() => {
      void syncSubmissions();
    }, 10000);

    return () => {
      window.removeEventListener('dristix:submission-updated', handleRefresh);
      window.removeEventListener('dristix:submission-deleted', handleRefresh);
      window.removeEventListener('dristix:submission-cleared', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
      clearInterval(pollInterval);
    };
  }, [syncSubmissions]);
  const { availableExams, availablePracticeDrills } = useExamStore();
  const { announce } = useAnnouncerStore();

  const [typeFilter, setTypeFilter] = useState<'all' | 'exam' | 'practice'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(0);
  const [historyVersion, setHistoryVersion] = useState<number>(0);

  // Re-render when student clears history or dismisses an attempt from their view
  useEffect(() => {
    const handleStudentHistoryCleared = () => {
      setHistoryVersion((v) => v + 1);
    };
    window.addEventListener('dristix:student-history-cleared', handleStudentHistoryCleared);
    return () => {
      window.removeEventListener('dristix:student-history-cleared', handleStudentHistoryCleared);
    };
  }, []);

  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  // Filter submissions belonging strictly to the current logged-in student,
  // respecting candidate-level history clear/dismissal while leaving administrative records completely intact
  const studentSubmissions = useMemo(() => {
    if (!submissions || submissions.length === 0) return [];
    if (!currentStudent) return submissions;

    const studentKey = (currentStudent.rollNumber || currentStudent.id || '').trim().toLowerCase();
    const dismissedIds = getStudentDismissedIds(studentKey);
    const clearedAt = getStudentClearedTimestamp(studentKey);

    const matching = submissions.filter((s) => {
      if (!matchesStudent(s, currentStudent)) return false;

      // Hide attempts cleared by candidate from their personal history view
      if (clearedAt && s.submittedAt && s.submittedAt <= clearedAt) {
        return false;
      }

      // Hide individually dismissed attempts from student view
      if (dismissedIds.has(s.id)) {
        return false;
      }

      return true;
    });

    return deduplicateSubmissions(matching);
  }, [submissions, currentStudent, historyVersion]);

  // Derived Statistics & KPIs computed deterministically via computeAnalyticsSnapshot
  const snapshot = useMemo(() => computeAnalyticsSnapshot(studentSubmissions), [studentSubmissions]);
  const stats = useMemo(() => ({
    totalTests: snapshot.totalTests,
    examCount: snapshot.timedExamsCount,
    practiceCount: snapshot.drillsCount,
    bestScorePercent: snapshot.bestScorePercentage,
    bestScoreTitle: snapshot.bestScoreTitle,
    bestScoreMarks: snapshot.bestScoreMarks,
    avgAccuracy: snapshot.averageAccuracy,
    totalCorrect: snapshot.correctCount,
    totalIncorrect: snapshot.wrongCount,
    totalAttempted: snapshot.questionsSolved,
  }), [snapshot]);

  // Publish current live analytics stats to useExamStore so voice assistant and screen reader
  // always speak the 100% exact real-time numbers shown on the cards.
  useEffect(() => {
    useExamStore.getState().setCurrentAnalytics(snapshot);
  }, [snapshot]);

  // Filtered submissions based on search and type filter
  const filteredSubmissions = useMemo(() => {
    return studentSubmissions.filter((s) => {
      const matchesType = typeFilter === 'all' || s.examType === typeFilter;
      const matchesSearch =
        searchQuery.trim() === '' ||
        s.examTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.examCode.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [studentSubmissions, typeFilter, searchQuery]);

  // Pagination (5 items per page)
  const ITEMS_PER_PAGE = 5;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
    setFocusedRowIndex(0);
  }, [typeFilter, searchQuery]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredSubmissions.length / ITEMS_PER_PAGE));
  }, [filteredSubmissions.length]);

  const paginatedSubmissions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSubmissions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSubmissions, currentPage]);

  // Read full performance summary via speech synthesis
  const handleAnnounceSummary = () => {
    soundEffects.playSelect();
    if (!currentStudent) return;
    const latestSub = studentSubmissions[0];
    const latestDetails = latestSub
      ? ` Most recent test was ${latestSub.examTitle} on ${new Date(latestSub.submittedAt).toLocaleDateString()}, scoring ${Number(latestSub.score.toFixed(2))} out of ${latestSub.maxScore} points with ${Math.round(latestSub.percentage)} percent accuracy.`
      : '';
    const msg = `Performance summary for ${currentStudent.name}, Roll Number ${currentStudent.rollNumber}. Total tests completed: ${stats.totalTests}, including ${stats.examCount} timed exams and ${stats.practiceCount} practice drills. Best score: ${stats.bestScorePercent} percent (${stats.bestScoreMarks} points) in ${stats.bestScoreTitle}. Average accuracy: ${stats.avgAccuracy} percent. Questions solved: ${stats.totalAttempted} total, with ${stats.totalCorrect} correct and ${stats.totalIncorrect} wrong.${latestDetails} Press B or Escape to return to tests.`;
    announce(msg, 'assertive', true);
  };

  // Announce an individual test result
  const handleSpeakResult = (sub: typeof studentSubmissions[0]) => {
    soundEffects.playSelect();
    const dateStr = new Date(sub.submittedAt).toLocaleDateString();
    const msg = `Result for ${sub.examTitle}, code ${sub.examCode}. Attempted on ${dateStr}. Score achieved: ${Number(sub.score.toFixed(2))} out of ${sub.maxScore} points, accuracy ${Math.round(sub.percentage)} percent. Correct: ${sub.correctCount}, Incorrect: ${sub.incorrectCount}, Unattempted: ${sub.unattemptedCount}.`;
    announce(msg, 'assertive', true);
  };

  // Retake test directly
  const handleRetakeTest = async (sub: typeof studentSubmissions[0]) => {
    // 1. Refresh live catalog to guarantee 100% current admin deletion state
    await useExamStore.getState().loadCatalog();
    const { availableExams: currentExams, availablePracticeDrills: currentDrills, setUnavailableModal, selectExam: startExam } = useExamStore.getState();

    const all = [...currentExams, ...currentDrills];
    const target = all.find(
      (e) =>
        (e.id === sub.examId || (e.code && sub.examCode && e.code.toUpperCase() === sub.examCode.toUpperCase())) &&
        (e as any).published !== false
    );

    if (!target) {
      soundEffects.playTimerAlert();
      setUnavailableModal({
        isOpen: true,
        testTitle: sub.examTitle,
        testCode: sub.examCode,
        testType: sub.examType,
        reason: 'deleted_by_admin',
      });
      return;
    }

    void startExam(target.id, sub.examType);
  };

  // Keyboard navigation for the table rows
  const handleTableKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (paginatedSubmissions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (focusedRowIndex + 1) % paginatedSubmissions.length;
      setFocusedRowIndex(next);
      rowRefs.current[next]?.focus();
      soundEffects.playNavigate();
      const sub = paginatedSubmissions[next];
      announce(
        `Row ${next + 1}: ${sub.examTitle}, Score ${Number(sub.score.toFixed(2))}/${sub.maxScore}, Accuracy ${Math.round(sub.percentage)} percent.`,
        'polite',
        true
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (focusedRowIndex - 1 + paginatedSubmissions.length) % paginatedSubmissions.length;
      setFocusedRowIndex(prev);
      rowRefs.current[prev]?.focus();
      soundEffects.playNavigate();
      const sub = paginatedSubmissions[prev];
      announce(
        `Row ${prev + 1}: ${sub.examTitle}, Score ${Number(sub.score.toFixed(2))}/${sub.maxScore}, Accuracy ${Math.round(sub.percentage)} percent.`,
        'polite',
        true
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sub = paginatedSubmissions[focusedRowIndex];
      if (sub) {
        handleSpeakResult(sub);
      }
    }
  };

  // Welcome announcement on mount
  useEffect(() => {
    if (currentStudent) {
      announce(
        `Welcome to your Performance and Analytics Dashboard, ${currentStudent.name}. Total ${stats.totalTests} tests recorded. Use Tab or Arrow keys to navigate, or press B to return to tests.`,
        'polite',
        false
      );
    }
  }, [currentStudent?.id]);

  if (!currentStudent) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <p className="text-lg font-bold">Please log in to view your performance analytics.</p>
        <button
          type="button"
          onClick={onReturnToCatalog}
          className="mt-4 px-4 py-2 rounded-xl bg-theme-primary text-theme-primary-text font-bold"
        >
          Return to Portal
        </button>
      </div>
    );
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-label="Student Performance and Score Analytics Dashboard"
      className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-6 focus:outline-none"
    >
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b-2 border-theme-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReturnToCatalog}
              title="Return to Test Catalog (Shortcut: B or Esc)"
              aria-label="Return to Test Catalog (Shortcut: B or Esc)"
              className="px-3 py-1.5 rounded-xl border-2 border-theme-border bg-theme-bg hover:border-theme-primary text-theme-text text-xs font-bold flex items-center gap-1.5 transition focus:outline-none focus:ring-4 focus:ring-yellow-400"
            >
              <ArrowLeft className="w-4 h-4 text-theme-primary" aria-hidden="true" />
              <span>Back to Tests</span>
              <kbd className="hidden sm:inline-block text-[10px] font-sans font-bold px-1.5 py-0.2 rounded border border-theme-border bg-theme-surface">
                B
              </kbd>
            </button>
            <span className="text-theme-text/40">/</span>
            <span className="text-xs uppercase font-bold tracking-wider text-theme-text/60">
              Student Dashboard
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-theme-text tracking-tight mt-2 flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-theme-primary" aria-hidden="true" />
            <span>My Performance & Score Analytics</span>
          </h2>
          <p className="text-xs sm:text-sm text-theme-text/70 mt-1">
            Track your exam progression, best scores, accuracy breakdown, and practice history.
          </p>
        </div>

        {/* Candidate Profile Card & Audio Overview Button */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {studentSubmissions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Clear all your completed test history from your student view? Your actual test records and scores remain safely preserved in administrative records.')) {
                  useAuthStore.getState().clearStudentHistory();
                  setHistoryVersion((v) => v + 1);
                }
              }}
              className="px-3.5 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition focus:outline-none focus:ring-4 focus:ring-red-400"
              title="Clear all completed test history from student view"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>Clear History</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleAnnounceSummary}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border-2 border-theme-border bg-theme-primary text-theme-primary-text font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:bg-theme-primary-hover shadow-sm focus:outline-none focus:ring-4 focus:ring-yellow-400"
            title="Listen to full performance summary aloud via speech synthesis"
          >
            <Volume2 className="w-4 h-4 text-yellow-300" aria-hidden="true" />
            <span>Listen to Summary</span>
          </button>
        </div>
      </div>

      {/* Candidate Profile Strip */}
      <div className="p-4 sm:p-5 rounded-2xl border-2 border-theme-border bg-theme-surface flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-theme-primary bg-theme-primary/10 text-theme-primary flex items-center justify-center font-black text-lg">
            {currentStudent.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-theme-text">{currentStudent.name}</h3>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-theme-primary/10 text-theme-primary border border-theme-primary/30">
                {currentStudent.rollNumber}
              </span>
            </div>
            <span className="text-xs text-theme-text/70 block mt-0.5">
              Email: <span className="font-mono">{currentStudent.email}</span> • Mode:{' '}
              <span className="font-bold text-theme-text">{currentStudent.accessibilityPreference}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-theme-text/70 bg-theme-bg px-3 py-1.5 rounded-xl border border-theme-border">
          <Calendar className="w-4 h-4 text-theme-primary" aria-hidden="true" />
          <span>
            Registered:{' '}
            {currentStudent.registeredAt
              ? new Date(currentStudent.registeredAt).toLocaleDateString()
              : '—'}
          </span>
        </div>
      </div>

      {/* 4 Interactive KPI Cards */}
      <section aria-labelledby="kpi-heading" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <h3 id="kpi-heading" className="sr-only">Key Performance Metrics</h3>

        {/* Card 1: Total Tests Taken */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-theme-surface border-2 border-theme-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold text-theme-text/60">Tests Completed</span>
            <Target className="w-5 h-5 text-theme-primary" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-4xl font-black text-theme-text">{stats.totalTests}</span>
            <span className="text-xs text-theme-text/60 block mt-1">
              {stats.examCount} Timed Exams • {stats.practiceCount} Drills
            </span>
          </div>
        </div>

        {/* Card 2: Best Score Achieved */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-theme-surface border-2 border-theme-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold text-theme-text/60">Best Score</span>
            <Award className="w-5 h-5 text-theme-primary" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-4xl font-black text-theme-primary">
                {stats.bestScorePercent}%
              </span>
              <span className="text-xs font-bold text-theme-text/60">({stats.bestScoreMarks})</span>
            </div>
            <span className="text-xs text-theme-text/60 block mt-1 truncate" title={stats.bestScoreTitle}>
              {stats.bestScoreTitle}
            </span>
          </div>
        </div>

        {/* Card 3: Average Accuracy */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-theme-surface border-2 border-theme-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold text-theme-text/60">Average Accuracy</span>
            <TrendingUp className="w-5 h-5 text-theme-primary" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-4xl font-black text-theme-text">{stats.avgAccuracy}%</span>
            <div className="w-full bg-theme-border h-2 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-theme-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.avgAccuracy}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 4: Questions Solved */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-theme-surface border-2 border-theme-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold text-theme-text/60">Questions Solved</span>
            <Sparkles className="w-5 h-5 text-theme-primary" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-4xl font-black text-theme-text">
              {stats.totalAttempted}
            </span>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span className="text-theme-success font-bold flex items-center gap-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                {stats.totalCorrect} Correct
              </span>
              <span className="text-theme-danger font-bold flex items-center gap-0.5">
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                {stats.totalIncorrect} Wrong
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Examination History Log & Table */}
      <section aria-labelledby="history-heading" className="p-4 sm:p-6 rounded-2xl border-2 border-theme-border bg-theme-surface shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div>
            <h3 id="history-heading" className="text-xl font-bold text-theme-text flex items-center gap-2">
              <Clock className="w-5 h-5 text-theme-primary" aria-hidden="true" />
              <span>Examination & Practice Drill History</span>
            </h3>
            <p className="text-xs text-theme-text/70 mt-0.5">
              Use <strong>Arrow Down (↓)</strong> and <strong>Arrow Up (↑)</strong> to navigate rows. Press <strong>Enter</strong> to hear result.
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center border-2 border-theme-border rounded-xl p-0.5 bg-theme-bg">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  typeFilter === 'all'
                    ? 'bg-theme-primary text-theme-primary-text shadow-xs'
                    : 'text-theme-text hover:bg-theme-surface'
                }`}
              >
                All ({studentSubmissions.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('exam')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  typeFilter === 'exam'
                    ? 'bg-theme-primary text-theme-primary-text shadow-xs'
                    : 'text-theme-text hover:bg-theme-surface'
                }`}
              >
                Exams ({stats.examCount})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('practice')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  typeFilter === 'practice'
                    ? 'bg-theme-primary text-theme-primary-text shadow-xs'
                    : 'text-theme-text hover:bg-theme-surface'
                }`}
              >
                Drills ({stats.practiceCount})
              </button>
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-4 h-4 text-theme-text/50 absolute left-3 top-2.5" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by test name or code..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border-2 border-theme-border bg-theme-bg text-theme-text text-xs focus:outline-none focus:ring-4 focus:ring-theme-focus-ring focus:border-theme-primary"
              />
            </div>
          </div>
        </div>

        {/* Submissions Table with Keyboard Arrow Navigation */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Student Exam Submissions History Table"
          className="overflow-x-auto rounded-xl border border-theme-border focus:outline-none focus:ring-2 focus:ring-theme-primary/50"
        >
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-theme-bg/80 border-b-2 border-theme-border text-xs uppercase font-bold text-theme-text/70">
                <th scope="col" className="py-3 px-4">Test Title & Code</th>
                <th scope="col" className="py-3 px-4">Type</th>
                <th scope="col" className="py-3 px-4">Date Completed</th>
                <th scope="col" className="py-3 px-4">Score Achieved</th>
                <th scope="col" className="py-3 px-4">Accuracy</th>
                <th scope="col" className="py-3 px-4">Answers Breakdown</th>
                <th scope="col" className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody
              tabIndex={0}
              onKeyDown={handleTableKeyDown}
              className="divide-y divide-theme-border focus:outline-none bg-theme-surface"
            >
              {paginatedSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-theme-text/60">
                    <HelpCircle className="w-8 h-8 text-theme-text/40 mx-auto mb-2" aria-hidden="true" />
                    <p className="font-bold">No test submissions found matching your filter.</p>
                    <p className="text-xs mt-1">Start a mock exam or practice drill to see your performance here.</p>
                  </td>
                </tr>
              ) : (
                paginatedSubmissions.map((sub, idx) => {
                  const isFocused = focusedRowIndex === idx;
                  const isTopScore = sub.percentage === stats.bestScorePercent;

                  return (
                    <tr
                      key={sub.id}
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      tabIndex={0}
                      onFocus={() => setFocusedRowIndex(idx)}
                      className={`transition-colors focus:outline-none ${
                        isFocused
                          ? 'bg-theme-primary/10 ring-2 ring-theme-primary font-semibold'
                          : 'hover:bg-theme-bg/60'
                      }`}
                    >
                      {/* Test Title & Code */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="font-bold text-theme-text flex items-center gap-1.5">
                          {isTopScore && <span title="Personal Best Score">🏆</span>}
                          <span className="line-clamp-1">{sub.examTitle}</span>
                        </div>
                        <span className="text-xs font-mono text-theme-primary mt-0.5 block font-semibold">
                          {sub.examCode}
                        </span>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center justify-center border whitespace-nowrap ${
                            sub.examType === 'practice'
                              ? 'bg-theme-primary/15 text-theme-primary border-theme-primary/30'
                              : 'bg-theme-surface-elevated text-theme-text border-theme-border'
                          }`}
                        >
                          {sub.examType === 'practice' ? 'Practice Drill' : 'Timed Exam'}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 align-middle text-xs text-theme-text/80 whitespace-nowrap">
                        <div className="font-semibold text-theme-text">
                          {new Date(sub.submittedAt).toLocaleDateString()}
                        </div>
                        <div className="text-theme-text/50 font-mono text-[11px] mt-0.5">
                          {new Date(sub.submittedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Score Achieved */}
                      <td className="py-3.5 px-4 align-middle font-bold text-theme-text whitespace-nowrap">
                        <span className="text-base font-extrabold">{Number(sub.score.toFixed(2))}</span>
                        <span className="text-xs text-theme-text/60"> / {sub.maxScore} pts</span>
                      </td>

                      {/* Accuracy */}
                      <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold border inline-flex items-center justify-center ${
                            sub.percentage >= 80
                              ? 'bg-theme-success/15 text-theme-success border-theme-success/30'
                              : sub.percentage >= 60
                              ? 'bg-theme-primary/15 text-theme-primary border-theme-primary/30'
                              : 'bg-theme-danger/15 text-theme-danger border-theme-danger/30'
                          }`}
                        >
                          {Math.round(sub.percentage)}%
                        </span>
                      </td>

                      {/* Breakdown */}
                      <td className="py-3.5 px-4 align-middle text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-theme-success/15 text-theme-success font-bold">
                            {sub.correctCount} Correct
                          </span>
                          <span className="px-2 py-0.5 rounded bg-theme-danger/15 text-theme-danger font-bold">
                            {sub.incorrectCount} Incorrect
                          </span>
                          <span className="px-2 py-0.5 rounded bg-theme-border/40 text-theme-text/70 font-medium">
                            {sub.unattemptedCount} Skipped
                          </span>
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 align-middle text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleSpeakResult(sub)}
                            className="px-2.5 py-1.5 rounded-lg border border-theme-border bg-theme-bg hover:border-theme-primary text-theme-text text-xs font-semibold flex items-center gap-1.5 focus:outline-none focus:ring-4 focus:ring-yellow-400 transition"
                            title="Speak result aloud"
                            aria-label={`Read result for ${sub.examTitle} aloud`}
                          >
                            <Volume2 className="w-3.5 h-3.5 text-theme-primary" aria-hidden="true" />
                            <span>Speak</span>
                          </button>

                          {(() => {
                            const isAvailable = [...availableExams, ...availablePracticeDrills].some(
                              (e) =>
                                (e.id === sub.examId || (e.code && sub.examCode && e.code.toUpperCase() === sub.examCode.toUpperCase())) &&
                                (e as any).published !== false
                            );
                            return (
                              <button
                                type="button"
                                onClick={() => void handleRetakeTest(sub)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 focus:outline-none focus:ring-4 transition shadow-xs cursor-pointer ${
                                  isAvailable
                                    ? 'border-theme-primary bg-theme-primary text-theme-primary-text hover:bg-theme-primary/90 focus:ring-theme-focus-ring'
                                    : 'border-theme-warning/50 bg-theme-warning/10 text-theme-warning hover:bg-theme-warning/20 focus:ring-theme-focus-ring'
                                }`}
                                title={
                                  isAvailable
                                    ? 'Retake this test'
                                    : 'Test unavailable or removed by admin — click to view notice'
                                }
                                aria-label={
                                  isAvailable
                                    ? `Retake test ${sub.examTitle}`
                                    : `Test ${sub.examTitle} is unavailable in student portal — click to view notice`
                                }
                              >
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{isAvailable ? 'Retake' : 'Unavailable'}</span>
                              </button>
                            );
                          })()}

                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Remove attempt record for ${sub.examTitle} from your student view? Your actual submission remains safely recorded in administration files.`)) {
                                useAuthStore.getState().dismissStudentSubmission(sub.id);
                                setHistoryVersion((v) => v + 1);
                              }
                            }}
                            className="p-1.5 rounded-lg border border-theme-border bg-theme-bg hover:border-theme-danger/50 hover:bg-theme-danger/10 text-theme-text/60 hover:text-theme-danger transition focus:outline-none focus:ring-4 focus:ring-theme-focus-ring"
                            title="Remove this test attempt from your view"
                            aria-label={`Remove attempt record for ${sub.examTitle} from view`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredSubmissions.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-theme-border">
            <div className="text-xs text-theme-text/70 font-medium">
              Showing <span className="font-bold text-theme-text">{Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredSubmissions.length)}</span> to{' '}
              <span className="font-bold text-theme-text">{Math.min(currentPage * ITEMS_PER_PAGE, filteredSubmissions.length)}</span> of{' '}
              <span className="font-bold text-theme-text">{filteredSubmissions.length}</span> submissions
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border-2 border-theme-border bg-theme-bg text-theme-text font-bold text-xs hover:border-theme-primary hover:text-theme-primary disabled:opacity-40 disabled:hover:border-theme-border disabled:hover:text-theme-text transition flex items-center gap-1"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Previous</span>
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg font-bold text-xs transition border-2 ${
                      currentPage === page
                        ? 'bg-theme-primary text-theme-primary-text border-theme-primary shadow-xs'
                        : 'bg-theme-bg border-theme-border text-theme-text hover:border-theme-primary'
                    }`}
                    aria-label={`Page ${page}`}
                    aria-current={currentPage === page ? 'page' : undefined}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border-2 border-theme-border bg-theme-bg text-theme-text font-bold text-xs hover:border-theme-primary hover:text-theme-primary disabled:opacity-40 disabled:hover:border-theme-border disabled:hover:text-theme-text transition flex items-center gap-1"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};
