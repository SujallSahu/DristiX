import { useExamStore } from '../store/useExamStore';
import {
  useAuthStore,
  getStudentClearedTimestamp,
  getStudentDismissedIds,
} from '../store/useAuthStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { voiceRecognition } from './voiceRecognition';
import type { QuestionItem } from '../../shared/types';

export interface PageContextSnapshot {
  activeView: 'catalog' | 'exam' | 'analytics' | 'report';
  isSubmitted: boolean;
  isSubmitModalOpen?: boolean;
  isPaletteOpen?: boolean;
  portalTab: 'exams' | 'practice';
  voiceLanguageMode: 'auto' | 'hi-IN' | 'en-IN' | 'en-US';
  isHindiMode: boolean;
  studentName: string;
  studentRoll: string;
  totalSubmissions: number;
  bestScorePercentage: number;
  bestScoreTitle: string;
  averageAccuracy: number;
  theme?: string;
  fontSize?: number;
  availableThemes?: { id: string; name: string; description: string }[];

  // Diagnostic Report context (if activeView === 'report')
  diagnosticReport?: {
    examTitle: string;
    totalScore: number;
    maxScore: number;
    scorePercentage: number;
    attemptedCount: number;
    correctCount: number;
    incorrectCount: number;
    unattemptedCount: number;
    verbalSummary: string[];
  };

  // Candidate Exam Feedback context
  feedback?: {
    isOpen: boolean;
    rating: number;
    tags: string[];
    comment: string;
    isSubmitted: boolean;
  };

  // Catalog context
  availableExams: {
    id: string;
    code: string;
    title: string;
    durationMinutes: number;
    questionCount: number;
    category: string;
    difficulty: string;
    negativeMarking: string;
  }[];
  availableDrills: {
    id: string;
    code: string;
    title: string;
    durationMinutes: number;
    questionCount: number;
    category: string;
  }[];

  // Active Exam context (if activeView === 'exam')
  currentExam?: {
    id: string;
    code: string;
    title: string;
    totalQuestions: number;
    currentQuestionNumber: number;
    durationMinutes: number;
    timeRemainingFormatted: string;
    remainingMinutes: number;
    remainingSeconds: number;
    isPractice: boolean;
  };
  currentQuestion?: {
    number: number;
    questionNumber: number;
    text: string;
    section: string;
    equationLatex?: string;
    options: { number: number; text: string; isSelected: boolean }[];
    selectedOption: number | null;
    isMarkedForReview: boolean;
    hint?: string;
    explanation?: string;
    graph?: import('../../shared/types').QuestionGraph;
    diagramUrl?: string;
    diagramType?: 'image' | 'chart' | 'geometry' | 'svg';
    diagramDescription?: string;
    diagramAiExplanation?: import('../../shared/types').AiDiagramExplanation;
  };
  analytics?: {
    totalTests: number;
    timedExamsCount: number;
    drillsCount: number;
    bestScorePercentage: number;
    bestScoreTitle: string;
    bestScoreMarks: string;
    averageAccuracy: number;
    questionsSolved: number;
    correctCount: number;
    wrongCount: number;
    recentSubmissions: {
      examTitle: string;
      examCode: string;
      examType: 'exam' | 'practice';
      date: string;
      time: string;
      score: number;
      maxScore: number;
      percentage: number;
      correctCount: number;
      incorrectCount: number;
      unattemptedCount: number;
    }[];
  };
}

export function getAssistantContext(): PageContextSnapshot {
  const examStore = useExamStore.getState();
  const authStore = useAuthStore.getState();

  const student = authStore.currentStudent || {
    name: authStore.submissions[0]?.studentName || 'Candidate',
    rollNumber: authStore.submissions[0]?.studentRoll || 'DX-000',
    id: authStore.submissions[0]?.studentId || 'std-guest',
    accessibilityPreference: 'Standard',
  };

  const studentKey = (student.rollNumber || student.id || '').trim().toLowerCase();
  const clearedAt = getStudentClearedTimestamp(studentKey);
  const dismissedIds = getStudentDismissedIds(studentKey);

  let studentSubs = authStore.submissions.filter((s) => {
    const sRoll = s.studentRoll ? s.studentRoll.trim().toLowerCase() : '';
    const sId = s.studentId ? String(s.studentId).trim().toLowerCase() : '';
    const sName = s.studentName ? s.studentName.trim().toLowerCase() : '';

    const isMatch =
      (student.rollNumber && (sRoll === student.rollNumber.toLowerCase() || sId === student.rollNumber.toLowerCase())) ||
      (student.id && (sId === student.id || sRoll === student.id)) ||
      (student.name && sName === student.name.toLowerCase());

    if (!isMatch) return false;
    if (clearedAt && s.submittedAt <= clearedAt) return false;
    if (dismissedIds.has(s.id)) return false;
    return true;
  });

  // Live analytics directly from the mounted StudentAnalyticsView component take absolute precedence
  const liveA = examStore.currentAnalytics;
  const total = liveA ? liveA.totalTests : studentSubs.length;
  const examCount = liveA ? liveA.timedExamsCount : studentSubs.filter((s) => s.examType === 'exam').length;
  const practiceCount = liveA ? liveA.drillsCount : studentSubs.filter((s) => s.examType === 'practice').length;

  let best = studentSubs[0];
  let sumPercentage = 0;
  let sumCorrect = 0;
  let sumIncorrect = 0;

  studentSubs.forEach((s) => {
    sumPercentage += s.percentage;
    sumCorrect += s.correctCount;
    sumIncorrect += s.incorrectCount;
    if (
      !best ||
      s.percentage > best.percentage ||
      (s.percentage === best.percentage && s.score > best.score)
    ) {
      best = s;
    }
  });

  const bestScorePercentage = liveA ? liveA.bestScorePercentage : (best ? Math.round(best.percentage) : 0);
  const bestScoreTitle = liveA ? liveA.bestScoreTitle : (best ? best.examTitle : 'None');
  const bestScoreMarks = liveA ? liveA.bestScoreMarks : (best ? `${Number(best.score.toFixed(2))}/${best.maxScore}` : '0/0');
  const avgAccuracy = liveA ? liveA.averageAccuracy : (total > 0 ? Math.round(sumPercentage / total) : 0);
  const totalCorrect = liveA ? liveA.correctCount : sumCorrect;
  const totalIncorrect = liveA ? liveA.wrongCount : sumIncorrect;
  const totalAttempted = liveA ? liveA.questionsSolved : (sumCorrect + sumIncorrect);

  const recentSubs = (liveA?.recentSubmissions && liveA.recentSubmissions.length > 0)
    ? liveA.recentSubmissions
    : studentSubs.slice(0, 10).map((s) => ({
        examTitle: s.examTitle,
        examCode: s.examCode,
        examType: s.examType,
        date: new Date(s.submittedAt).toLocaleDateString(),
        time: new Date(s.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        score: Number(s.score.toFixed(2)),
        maxScore: s.maxScore,
        percentage: Math.round(s.percentage),
        correctCount: s.correctCount,
        incorrectCount: s.incorrectCount,
        unattemptedCount: s.unattemptedCount,
      }));

  const catalogExams = examStore.availableExams.map((e) => ({
    id: e.id,
    code: e.code,
    title: e.title,
    durationMinutes: e.durationMinutes,
    questionCount: e.questionCount || (e.questions ? e.questions.length : 5),
    category: e.category,
    difficulty: e.difficulty,
    negativeMarking: e.negativeMarking,
  }));

  const catalogDrills = examStore.availablePracticeDrills.map((d) => ({
    id: d.id,
    code: d.code,
    title: d.title,
    durationMinutes: d.durationMinutes,
    questionCount: d.questionCount || (d.questions ? d.questions.length : 5),
    category: d.category,
  }));

  let activeView: 'catalog' | 'exam' | 'analytics' | 'report' = examStore.activeView;
  const portalTab = examStore.portalTab;

  // What is on screen is decided by exactly two values: App.tsx renders
  // analytics → catalog → report → exam from `activeView` and `isSubmitted`,
  // in that order, so that is exactly what the snapshot should describe.
  //
  // This used to be re-derived by sniffing the DOM instead, and every probe in
  // that sniffing was wrong in a way that MOVED the user rather than described
  // them:
  //
  //   * any [role="radiogroup"] counted as an open exam — but the catalog's own
  //     category-filter pills render one, and so does the header. So a single
  //     voice command wrote activeView:'exam' into the store and dropped the
  //     catalog behind the empty "No Questions Found" screen, recoverable only
  //     by reloading the page.
  //   * the catalog probe matched any input whose placeholder contains
  //     "Search", which the analytics view has — dragging analytics back to the
  //     catalog the moment the assistant read context.
  //   * the analytics marker it was compared against, `#student-analytics-view`,
  //     does not exist anywhere in the codebase, so that branch never ran.
  //
  // Reading context has to describe the screen, never navigate it.
  if (examStore.isSubmitted && examStore.activeView === 'exam') {
    activeView = 'report';
  }

  const snapshot: PageContextSnapshot = {
    activeView: activeView,
    isSubmitted: examStore.isSubmitted,
    isSubmitModalOpen: examStore.isSubmitModalOpen,
    isPaletteOpen: examStore.isPaletteOpen,
    portalTab: portalTab,
    voiceLanguageMode: voiceRecognition.getLanguageMode(),
    isHindiMode: voiceRecognition.isHindiMode(),
    studentName: student.name,
    studentRoll: student.rollNumber,
    totalSubmissions: total,
    bestScorePercentage,
    bestScoreTitle,
    averageAccuracy: avgAccuracy,
    theme: usePreferencesStore.getState().theme,
    fontSize: usePreferencesStore.getState().fontSize,
    availableThemes: [
      { id: 'high-contrast', name: 'High Contrast', description: 'Pure Black & Electric Yellow, 21:1 maximum contrast' },
      { id: 'dark', name: 'Charcoal Dark', description: 'Matte Charcoal & Emerald Green' },
      { id: 'teal-cream', name: 'Teal & Cream', description: 'Warm Ivory & Deep Teal' },
      { id: 'liquid-glass', name: 'Liquid Glass', description: 'Frosted Crystal & Royal Amethyst Purple' },
    ],
    availableExams: catalogExams,
    availableDrills: catalogDrills,
    analytics: {
      totalTests: total,
      timedExamsCount: examCount,
      drillsCount: practiceCount,
      bestScorePercentage,
      bestScoreTitle,
      bestScoreMarks,
      averageAccuracy: avgAccuracy,
      questionsSolved: totalAttempted,
      correctCount: totalCorrect,
      wrongCount: totalIncorrect,
      recentSubmissions: recentSubs,
    },
    feedback: {
      isOpen: examStore.feedback?.isOpen || false,
      rating: examStore.feedback?.rating || 0,
      tags: examStore.feedback?.tags || [],
      comment: examStore.feedback?.comment || '',
      isSubmitted: examStore.feedback?.isSubmitted || false,
    },
  };

  if (activeView === 'report') {
    try {
      const rep = examStore.getDiagnosticReport();
      snapshot.diagnosticReport = {
        examTitle: rep.examTitle,
        totalScore: rep.totalScore,
        maxScore: rep.maxScore,
        scorePercentage: rep.scorePercentage,
        attemptedCount: rep.attemptedCount,
        correctCount: rep.correctCount,
        incorrectCount: rep.incorrectCount,
        unattemptedCount: rep.unattemptedCount,
        verbalSummary: rep.verbalSummary,
      };
    } catch {
      // fallback
    }
  }

  if (activeView === 'exam' && examStore.currentExam) {
    const curExam = examStore.currentExam;
    const curQ: QuestionItem | undefined = examStore.questions[examStore.currentIndex];
    const selectedOpt = curQ ? examStore.selectedOptions[curQ.id] || null : null;
    const isMarked = curQ ? !!examStore.markedForReview[curQ.id] : false;

    snapshot.currentExam = {
      id: curExam.id,
      code: curExam.code,
      title: curExam.title,
      totalQuestions: examStore.questions.length,
      currentQuestionNumber: examStore.currentIndex + 1,
      durationMinutes: curExam.durationMinutes,
      timeRemainingFormatted: examStore.formattedTime,
      remainingMinutes: Math.floor(examStore.timeRemaining / 60),
      remainingSeconds: examStore.timeRemaining % 60,
      isPractice: examStore.examMode === 'practice',
    };

    if (curQ) {
      snapshot.currentQuestion = {
        number: curQ.questionNumber,
        questionNumber: curQ.questionNumber,
        text: curQ.questionText,
        section: curQ.section,
        equationLatex: curQ.mathLatex,
        options: curQ.options.map((opt) => ({
          number: opt.number,
          text: opt.text,
          isSelected: selectedOpt === opt.number,
        })),
        selectedOption: selectedOpt,
        isMarkedForReview: isMarked,
        hint: curQ.hint,
        explanation: curQ.explanation,
        graph: curQ.graph,
        diagramUrl: curQ.diagramUrl,
        diagramType: curQ.diagramType,
        diagramDescription: curQ.diagramDescription,
        diagramAiExplanation: curQ.diagramAiExplanation,
      };
    }
  }

  return snapshot;
}
