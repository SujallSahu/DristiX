import { create } from 'zustand';
import { type Exam, type ExamSummary, type QuestionItem, type NotificationTestDetails, hasValidAiExplanation } from '../../shared/types';
import { soundEffects } from '../utils/soundEffects';
import { useAnnouncerStore } from './useAnnouncerStore';
import { verbalizeMath, verbalizeForSpeech } from '../utils/mathVerbalizer';
import { describeOptionSelection } from '../utils/optionSpeech';
import { isHindiPreferred } from '../utils/voiceRecognition';
import {
  useAuthStore,
  type ExamSubmission,
  authBroadcastChannel,
  getStudentClearedTimestamp,
  getStudentDismissedIds,
  deduplicateSubmissions,
  matchesStudent,
} from './useAuthStore';
import { getDataSource } from '../services/dataSource';
import { dispatchAccessibilityEvent } from '../accessibility';
import { offlinePracticeStorage } from '../services/offlinePracticeStorage';
import { resolveNotificationTestDetails } from './useNotificationStore';
import type { GradeResult, StartAttemptResult } from '../../shared/types';

export interface SectionDiagnostic {
  section: string;
  total: number;
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface DiagnosticReportData {
  examTitle: string;
  totalQuestions: number;
  attemptedCount: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  markedCount: number;
  scorePercentage: number;
  totalScore: number;
  maxScore: number;
  sectionDiagnostics: SectionDiagnostic[];
  verbalSummary: string[];
  weakAreas: string[];
  strongAreas: string[];
}

export interface AnalyticsSnapshot {
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
  recentSubmissions: Array<{
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
  }>;
}

export function computeAnalyticsSnapshot(subs: ExamSubmission[]): AnalyticsSnapshot {
  const cleanSubs = deduplicateSubmissions(subs);
  const total = cleanSubs.length;
  if (total === 0) {
    return {
      totalTests: 0,
      timedExamsCount: 0,
      drillsCount: 0,
      bestScorePercentage: 0,
      bestScoreTitle: 'N/A',
      bestScoreMarks: '0',
      averageAccuracy: 0,
      questionsSolved: 0,
      correctCount: 0,
      wrongCount: 0,
      recentSubmissions: [],
    };
  }

  const timedExamsCount = cleanSubs.filter((s) => s.examType === 'exam').length;
  const drillsCount = cleanSubs.filter((s) => s.examType === 'practice').length;

  let best = cleanSubs[0];
  let sumPercentage = 0;
  let sumCorrect = 0;
  let sumIncorrect = 0;

  cleanSubs.forEach((s) => {
    sumPercentage += s.percentage;
    sumCorrect += s.correctCount;
    sumIncorrect += s.incorrectCount;
    if (s.percentage > best.percentage || (s.percentage === best.percentage && s.score > best.score)) {
      best = s;
    }
  });

  return {
    totalTests: total,
    timedExamsCount,
    drillsCount,
    bestScorePercentage: Math.round(best.percentage),
    bestScoreTitle: best.examTitle,
    bestScoreMarks: `${Number(best.score.toFixed(2))}/${best.maxScore}`,
    averageAccuracy: Math.round(sumPercentage / total),
    questionsSolved: sumCorrect + sumIncorrect,
    correctCount: sumCorrect,
    wrongCount: sumIncorrect,
    recentSubmissions: cleanSubs.slice(0, 10).map((s) => ({
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
    })),
  };
}

interface ExamState {
  currentAnalytics: AnalyticsSnapshot | null;
  setCurrentAnalytics: (analytics: AnalyticsSnapshot | null) => void;
  portalTab: 'exams' | 'practice';
  availableExams: Exam[];
  availablePracticeDrills: Exam[];
  currentExam: Exam;
  activeView: 'catalog' | 'exam' | 'analytics';
  questions: QuestionItem[];
  currentIndex: number;
  selectedOptions: Record<string, number>; // questionId -> option number (1-4)
  markedForReview: Record<string, boolean>; // questionId -> boolean
  visitedQuestions: Record<string, boolean>;
  examMode: 'exam' | 'practice';
  isSubmitted: boolean;
  submissionTime: number | null;
  timeRemaining: number;
  formattedTime: string;
  isPaletteOpen: boolean;
  isSettingsOpen: boolean;
  isShortcutsOpen: boolean;
  isSubmitModalOpen: boolean;
  isSubmitting: boolean;
  activeSectionFilter: string;

  /**
   * True while the catalog is being fetched or lazily seeded. The listing
   * screen uses this to show a loading state instead of a misleading
   * "no examinations match" message.
   */
  isCatalogLoading: boolean;

  /**
   * Why the catalog could not be loaded, if it could not. Distinguishes "no
   * exams exist" from "cannot reach the server" / "session expired", which
   * need completely different advice.
   */
  catalogError: string | null;

  /**
   * Server-side attempt id. Null before an attempt starts, and in offline mode
   * the local data source mints its own so the rest of the code is identical.
   */
  attemptId: string | null;
  /** Server-authoritative deadline (epoch ms). Null when offline. */
  expiresAtMs: number | null;
  /** Last grade result returned by the server, if any. */
  serverReport: GradeResult | null;

  // View & Exam Actions
  setPortalTab: (tab: 'exams' | 'practice') => void;
  /** Loads the catalog from the active data source. Call once on boot. */
  loadCatalog: () => Promise<void>;
  /**
   * Starts (or resumes) an attempt and opens the exam.
   *
   * `options.announce` exists because the voice assistant speaks its own
   * confirmation for the same action. Letting this one speak too meant two
   * messages for one command, and since every announcement interrupts, the
   * second cancelled the first mid-sentence — the assistant sounded like it was
   * starting its reply over.
   */
  selectExam: (
    examId: string,
    forceMode?: 'exam' | 'practice',
    options?: {
      announce?: boolean;
      testDetails?: NotificationTestDetails | null;
    }
  ) => Promise<void>;
  /** Pushes the current progress to the server. Debounced internally. */
  persistState: () => void;
  returnToCatalog: () => void;
  openAnalytics: () => void;
  addNewExam: (
    newExam: Exam,
    mode: 'exam' | 'practice'
  ) => Promise<{ ok: boolean; message?: string; exam?: ExamSummary }>;
  updateExistingExam: (
    examId: string,
    updatedExam: Exam,
    mode: 'exam' | 'practice'
  ) => Promise<{ ok: boolean; message?: string; exam?: ExamSummary }>;
  loadExamForEdit: (examId: string) => Promise<Exam | null>;
  deleteCustomExam: (examId: string) => Promise<void>;

  // Question navigation actions
  nextQuestion: (options?: { announce?: boolean }) => void;
  previousQuestion: (options?: { announce?: boolean }) => void;
  jumpToQuestion: (index: number, options?: { announce?: boolean }) => void;
  suppressAutoRead: boolean;
  setSuppressAutoRead: (val: boolean) => void;
  /**
   * `options.announce` lets a caller that is about to confirm the choice itself
   * stay the only voice. Two confirmations for one action means the second
   * cancels the first mid-sentence, and the candidate never hears the option.
   */
  selectOption: (optionNumber: number, options?: { announce?: boolean }) => void;
  clearOption: (options?: { announce?: boolean }) => void;
  toggleMarkForReview: () => void;
  setExamMode: (mode: 'exam' | 'practice') => void;
  setTimer: (sec: number, formatted: string) => void;
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setSubmitModalOpen: (open: boolean) => void;
  setActiveSectionFilter: (section: string) => void;
  submitExam: () => Promise<void>;
  resetExam: () => void;
  getDiagnosticReport: () => DiagnosticReportData;
  announceCurrentQuestion: (speakTTS?: boolean, includeOptions?: boolean) => void;
  readCurrentQuestion: () => void;
  explainCurrentDiagram: (autoSpeak?: boolean) => Promise<void>;
  readTimer: () => void;

  // Feedback State & Actions
  feedback: ExamFeedbackState;
  openFeedbackModal: (force?: boolean) => void;
  closeFeedbackModal: () => void;
  setFeedbackRating: (rating: number, method?: 'voice' | 'keyboard') => void;
  toggleFeedbackTag: (tag: string, method?: 'voice' | 'keyboard') => void;
  setFeedbackComment: (comment: string, method?: 'voice' | 'keyboard') => void;
  submitExamFeedback: () => Promise<void>;
  skipExamFeedback: () => void;
}

export interface ExamFeedbackState {
  isOpen: boolean;
  rating: number; // 0 (unselected) or 1-5
  tags: string[];
  comment: string;
  inputMethod: 'voice' | 'keyboard' | 'mixed';
  isSubmitting: boolean;
  isSubmitted: boolean;
}

/**
 * Placeholder used until `loadCatalog()` fills the store from the backend.
 * The catalog is never seeded from localStorage any more: it lives in MongoDB,
 * which is also what keeps the answer key out of this bundle.
 */
const EMPTY_EXAM: Exam = {
  id: '',
  code: '',
  title: 'Loading examinations…',
  description: '',
  category: 'Staff Selection',
  durationMinutes: 60,
  totalMarks: 0,
  negativeMarking: 'No negative marking (Practice)',
  difficulty: 'Moderate',
  sections: [],
  questionCount: 0,
  questions: [],
};

export const useExamStore = create<ExamState>((set, get) => ({
  currentAnalytics: null,
  setCurrentAnalytics: (analytics) => set({ currentAnalytics: analytics }),
  portalTab: 'exams',
  availableExams: [],
  availablePracticeDrills: [],
  currentExam: EMPTY_EXAM,
  activeView: 'catalog', // Default landing on the accessible catalog dashboard
  questions: [],
  currentIndex: 0,
  selectedOptions: {},
  markedForReview: {},
  visitedQuestions: {},
  examMode: 'exam',
  isSubmitted: false,
  submissionTime: null,
  // The real duration arrives with the attempt, from the server's own clock.
  timeRemaining: 0,
  formattedTime: '00:00:00',
  isPaletteOpen: false,
  isSettingsOpen: false,
  isShortcutsOpen: false,
  isSubmitModalOpen: false,
  isSubmitting: false,
  activeSectionFilter: 'All',
  isCatalogLoading: true,
  catalogError: null,
  attemptId: null,
  expiresAtMs: null,
  serverReport: null,
  suppressAutoRead: false,
  feedback: {
    isOpen: false,
    rating: 0,
    tags: [],
    comment: '',
    inputMethod: 'keyboard',
    isSubmitting: false,
    isSubmitted: false,
  },
  setSuppressAutoRead: (val: boolean) => set({ suppressAutoRead: val }),

  nextQuestion: (options?: { announce?: boolean }) => {
    const { currentIndex, questions } = get();
    if (currentIndex < questions.length - 1) {
      const currentQ = questions[currentIndex];
      const nextIdx = currentIndex + 1;
      const nextQ = questions[nextIdx];
      set((state) => ({
        currentIndex: nextIdx,
        suppressAutoRead: options?.announce === false,
        visitedQuestions: { ...state.visitedQuestions, [nextQ.id]: true },
      }));

      if (currentQ && nextQ && nextQ.section && currentQ.section && nextQ.section !== currentQ.section) {
        dispatchAccessibilityEvent('SECTION_CHANGED', {
          previousSection: currentQ.section,
          newSection: nextQ.section,
        });
      }

      dispatchAccessibilityEvent('QUESTION_CHANGED', {
        questionIndex: nextIdx,
        questionNumber: nextQ.questionNumber,
        totalQuestions: questions.length,
        questionText: nextQ.questionText,
        sectionName: nextQ.section,
        previousQuestionIndex: currentIndex,
      });
    } else {
      const total = questions.length;
      const answered = Object.keys(get().selectedOptions).length;
      const msg = answered >= total
        ? `You have reached the end of the test. All ${total} questions are answered. Say "Submit exam" to finish and submit your test.`
        : `You are at the last question (${total} of ${total}). Say "Submit exam" to finish your test, or "Previous question" to review.`;
      dispatchAccessibilityEvent('NAVIGATION_ERROR', {
        reason: 'LAST_QUESTION',
        message: msg,
      });
      if (options?.announce !== false) {
        useAnnouncerStore.getState().announce(msg, 'assertive', true);
      }
    }
  },

  previousQuestion: (options?: { announce?: boolean }) => {
    const { currentIndex, questions } = get();
    if (currentIndex > 0) {
      const currentQ = questions[currentIndex];
      const prevIdx = currentIndex - 1;
      const prevQ = questions[prevIdx];
      set((state) => ({
        currentIndex: prevIdx,
        suppressAutoRead: options?.announce === false,
        visitedQuestions: { ...state.visitedQuestions, [prevQ.id]: true },
      }));

      if (currentQ && prevQ && prevQ.section && currentQ.section && prevQ.section !== currentQ.section) {
        dispatchAccessibilityEvent('SECTION_CHANGED', {
          previousSection: currentQ.section,
          newSection: prevQ.section,
        });
      }

      dispatchAccessibilityEvent('QUESTION_CHANGED', {
        questionIndex: prevIdx,
        questionNumber: prevQ.questionNumber,
        totalQuestions: questions.length,
        questionText: prevQ.questionText,
        sectionName: prevQ.section,
        previousQuestionIndex: currentIndex,
      });
    } else {
      dispatchAccessibilityEvent('NAVIGATION_ERROR', {
        reason: 'FIRST_QUESTION',
        message: 'You are at the first question.',
      });
      if (options?.announce !== false) {
        useAnnouncerStore.getState().announce('You are at the first question.', 'polite', true);
      }
    }
  },

  jumpToQuestion: (index: number, options?: { announce?: boolean }) => {
    const { questions, currentIndex } = get();
    if (index >= 0 && index < questions.length) {
      const currentQ = questions[currentIndex];
      const targetQ = questions[index];
      set((state) => ({
        currentIndex: index,
        suppressAutoRead: options?.announce === false,
        isPaletteOpen: false,
        visitedQuestions: { ...state.visitedQuestions, [targetQ.id]: true },
      }));

      if (currentQ && targetQ && targetQ.section && currentQ.section && targetQ.section !== currentQ.section) {
        dispatchAccessibilityEvent('SECTION_CHANGED', {
          previousSection: currentQ.section,
          newSection: targetQ.section,
        });
      }

      dispatchAccessibilityEvent('QUESTION_CHANGED', {
        questionIndex: index,
        questionNumber: targetQ.questionNumber,
        totalQuestions: questions.length,
        questionText: targetQ.questionText,
        sectionName: targetQ.section,
        previousQuestionIndex: currentIndex,
      });
    }
  },

  selectOption: (optionNumber: number, options?: { announce?: boolean }) => {
    const { currentIndex, questions, selectedOptions } = get();
    const currentQ = questions[currentIndex];
    const opt = currentQ?.options?.find((o) => o.number === optionNumber);
    if (!opt || !currentQ) return;

    const updated = { ...selectedOptions, [currentQ.id]: optionNumber };
    set({ selectedOptions: updated });

    dispatchAccessibilityEvent('OPTION_SELECTED', {
      questionId: currentQ.id,
      questionNumber: currentQ.questionNumber,
      optionNumber,
      optionText: opt.text,
      silentSpeech: options?.announce === false,
    });

    if (options?.announce !== false) {
      const total = questions.length;
      const answered = Object.keys(updated).length;
      const isLast = currentIndex >= total - 1;
      let suffix = '';
      if (answered >= total) {
        suffix = ` All ${total} questions have been answered. Say "Submit exam" to finish and submit your test.`;
      } else if (isLast) {
        suffix = ` This is the last question (${total} of ${total}). Say "Submit exam" to finish your test, or "Previous question" to review.`;
      }
      useAnnouncerStore
        .getState()
        .announce(`${describeOptionSelection(currentQ, optionNumber)}${suffix}`, 'assertive', true, true);
    }
  },

  clearOption: (options?: { announce?: boolean }) => {
    const { currentIndex, questions, selectedOptions } = get();
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    if (selectedOptions[currentQ.id]) {
      const next = { ...selectedOptions };
      delete next[currentQ.id];
      set({ selectedOptions: next });

      dispatchAccessibilityEvent('ANSWER_CLEARED', {
        questionId: currentQ.id,
        questionNumber: currentQ.questionNumber,
      });

      if (options?.announce !== false) {
        useAnnouncerStore.getState().announce(
          `Selection cleared for Question ${currentQ.questionNumber}.`,
          'polite',
          true
        );
      }
    } else if (options?.announce !== false) {
      useAnnouncerStore.getState().announce(
        `No option was selected for Question ${currentQ.questionNumber}.`,
        'polite',
        true
      );
    }
  },

  toggleMarkForReview: () => {
    const { currentIndex, questions, markedForReview } = get();
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const isMarked = !!markedForReview[currentQ.id];
    const updated = { ...markedForReview, [currentQ.id]: !isMarked };
    set({ markedForReview: updated });

    dispatchAccessibilityEvent('MARK_FOR_REVIEW', {
      questionId: currentQ.id,
      questionNumber: currentQ.questionNumber,
      isMarked: !isMarked,
    });
  },

  /**
   * Loads the exam catalog from the active data source.
   *
   * In api mode this is the ONLY way questions enter the app, and the server
   * strips the answer key before sending. In offline mode it is a no-op
   * because the catalog is already seeded from the bundled data.
   */
  loadCatalog: async () => {
    // Only fetch catalog if student or admin session is active, avoiding 401 errors on public/login screens
    const { currentStudent, isAdminAuthenticated } = useAuthStore.getState();
    if (!currentStudent && !isAdminAuthenticated) {
      return;
    }
    set({ isCatalogLoading: true, catalogError: null });
    try {
      const { exams, drills } = await getDataSource().exams.getFullCatalog();
      set({ availableExams: exams, availablePracticeDrills: drills, catalogError: null });

      // Cache practice drills in IndexedDB for 100% offline practice
      void offlinePracticeStorage.cachePracticeDrills(
        drills.length ? drills : offlinePracticeStorage.bundledDrills
      );

      // Pre-cache practice drill questions into IndexedDB for offline access
      offlinePracticeStorage.bundledDrills.forEach((bd) => {
        if (bd.questions && bd.questions.length > 0) {
          void offlinePracticeStorage.cacheDrillQuestions(bd.id, bd.questions as QuestionItem[]);
          if (bd.code) {
            void offlinePracticeStorage.cacheDrillQuestions(bd.code, bd.questions as QuestionItem[]);
          }
        }
      });

      // Keep the placeholder currentExam pointing at something real so the
      // header does not read "Loading examinations…" forever.
      const all = get();
      if (!all.currentExam.id) {
        const first = all.availableExams[0] ?? all.availablePracticeDrills[0] ?? offlinePracticeStorage.bundledDrills[0];
        if (first) set({ currentExam: first });
      }
    } catch (err) {
      // Swallowing this used to leave an empty catalog and a "no examinations
      // have been published yet" message, which reads as an empty database when
      // the truth is usually "the server is unreachable" or "your session
      // expired". Both need very different responses from the user.
      const cachedDrills = await offlinePracticeStorage.getCachedPracticeDrills();
      if (cachedDrills && cachedDrills.length > 0) {
        set({
          availablePracticeDrills: cachedDrills,
          portalTab: 'practice',
          catalogError: null,
        });
        const all = get();
        if (!all.currentExam.id && cachedDrills[0]) {
          set({ currentExam: cachedDrills[0] });
        }
        useAnnouncerStore
          .getState()
          .announce(
            'ऑफलाइन प्रैक्टिस एरिना सक्रिय है। सभी अभ्यास उपलब्ध हैं।',
            'polite',
            true
          );
      } else {
        const message =
          err instanceof Error ? err.message : 'Could not reach the DristiX server.';
        set({ catalogError: message });
      }
    } finally {
      set({ isCatalogLoading: false });
    }
  },

  setExamMode: (mode) => {
    set({ examMode: mode });
    useAnnouncerStore.getState().announce(
      `Switched to ${mode === 'exam' ? 'Exam Mode (timed simulation)' : 'Practice Mode (with hints and solutions)'}.`,
      'polite',
      true
    );
  },

  setTimer: (sec, formatted) => {
    set({ timeRemaining: sec, formattedTime: formatted });
  },

  setPaletteOpen: (open) => set({ isPaletteOpen: open }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setShortcutsOpen: (open) => set({ isShortcutsOpen: open }),
  setSubmitModalOpen: (open) => set({ isSubmitModalOpen: open }),
  setActiveSectionFilter: (section) => set({ activeSectionFilter: section }),

  openFeedbackModal: (force = false) => {
    const s = get();
    if (s.feedback.isOpen) return;
    if (!force && s.feedback.isSubmitted) return;
    set((state) => ({ feedback: { ...state.feedback, isOpen: true } }));
    useAnnouncerStore
      .getState()
      .announce(
        'परीक्षा समाप्त हो चुकी है। कृपया 1 से 5 स्टार रेटिंग देकर और बोलकर या लिखकर अपना फीडबैक दें। Submit करने के लिए Ctrl Enter दबाएं या "फीडबैक सबमिट करो" बोलें।',
        'assertive',
        true
      );
  },

  closeFeedbackModal: () => {
    set((s) => ({ feedback: { ...s.feedback, isOpen: false } }));
  },

  setFeedbackRating: (rating, method = 'keyboard') => {
    const clamped = Math.max(1, Math.min(5, Math.round(rating)));
    set((s) => ({
      feedback: {
        ...s.feedback,
        rating: clamped,
        inputMethod: s.feedback.inputMethod === 'keyboard' && method === 'voice' ? 'mixed' : (method || s.feedback.inputMethod),
      },
    }));
    soundEffects.playSelect();
    useAnnouncerStore
      .getState()
      .announce(
        isHindiPreferred() ? `रेटिंग ${clamped} स्टार चुनी गई।` : `Rating set to ${clamped} stars.`,
        'polite',
        true
      );
  },

  toggleFeedbackTag: (tag, method = 'keyboard') => {
    set((s) => {
      const exists = s.feedback.tags.includes(tag);
      const updated = exists ? s.feedback.tags.filter((t) => t !== tag) : [...s.feedback.tags, tag];
      return {
        feedback: {
          ...s.feedback,
          tags: updated,
          inputMethod: s.feedback.inputMethod === 'keyboard' && method === 'voice' ? 'mixed' : (method || s.feedback.inputMethod),
        },
      };
    });
    soundEffects.playSelect();
  },

  setFeedbackComment: (comment, method = 'keyboard') => {
    set((s) => ({
      feedback: {
        ...s.feedback,
        comment,
        inputMethod: s.feedback.inputMethod === 'keyboard' && method === 'voice' ? 'mixed' : (method || s.feedback.inputMethod),
      },
    }));
  },

  submitExamFeedback: async () => {
    const { feedback, currentExam } = get();
    if (feedback.rating === 0) {
      useAnnouncerStore
        .getState()
        .announce('कृपया सबमिट करने से पहले 1 से 5 स्टार रेटिंग चुनें।', 'assertive', true);
      return;
    }

    // Immediately close modal and mark as submitted so UI dismisses instantly
    set((s) => ({
      feedback: {
        ...s.feedback,
        isOpen: false,
        isSubmitting: true,
        isSubmitted: true,
      },
    }));

    const student = useAuthStore.getState().currentStudent;
    const feedbackPayload = {
      examId: currentExam.id || currentExam.code || 'exam_default',
      examTitle: currentExam.title || 'Examination',
      rating: feedback.rating,
      tags: feedback.tags,
      comment: feedback.comment,
      inputMethod: feedback.inputMethod,
      studentRoll: student?.rollNumber || '',
      studentName: student?.name || 'Candidate',
    };

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const finalizeSuccess = (offline = false) => {
      set((s) => ({
        feedback: {
          ...s.feedback,
          isOpen: false,
          isSubmitting: false,
          isSubmitted: true,
        },
      }));
      soundEffects.playSuccess();
      useAnnouncerStore
        .getState()
        .announce(
          offline
            ? (isHindiPreferred()
                ? 'ऑफलाइन मोड: आपका फीडबैक सुरक्षित कर लिया गया है और ऑनलाइन आने पर सिंक होगा। धन्यवाद!'
                : 'Offline mode: Your feedback has been saved and will sync when online. Thank you!')
            : (isHindiPreferred()
                ? 'आपका फीडबैक सफलतापूर्वक दर्ज कर लिया गया है। धन्यवाद!'
                : 'Thank you! Your feedback has been submitted successfully.'),
          'assertive',
          true
        );
    };

    if (isOffline) {
      void offlinePracticeStorage.saveOfflineFeedback(feedbackPayload);
      finalizeSuccess(true);
      return;
    }

    try {
      // Race network call with a 2.5 second timeout so UI never hangs if network is dead/frozen
      await Promise.race([
        getDataSource().exams.submitFeedback(feedbackPayload),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Network offline or timed out')), 2500)
        ),
      ]);
      finalizeSuccess(false);
    } catch (err) {
      console.warn('[OfflinePractice] Feedback network submit failed; saving offline:', err);
      void offlinePracticeStorage.saveOfflineFeedback(feedbackPayload);
      finalizeSuccess(true);
    }
  },

  skipExamFeedback: () => {
    set((s) => ({
      feedback: {
        ...s.feedback,
        isOpen: false,
      },
    }));
    soundEffects.playNavigate();
    useAnnouncerStore
      .getState()
      .announce(
        isHindiPreferred() ? 'फीडबैक छोड़ दिया गया है।' : 'Feedback skipped.',
        'polite',
        true
      );
  },

  setPortalTab: (tab) => {
    set({ portalTab: tab });
    soundEffects.playSelect();
    useAnnouncerStore
      .getState()
      .announce(
        tab === 'exams'
           ? 'Switched to Mock Examinations Catalog. Showing timed tests with negative marking.'
           : 'Switched to Practice Arena. Showing topic-wise drills with helpful hints and step-by-step solutions.',
        'assertive',
        true
      );
  },

  selectExam: async (
    examId: string,
    forceMode?: 'exam' | 'practice',
    options?: {
      announce?: boolean;
      testDetails?: NotificationTestDetails | null;
    }
  ) => {
    const { activeView, isSubmitted, currentExam } = get();

    // STRICT INTEGRITY: If candidate is taking a test, prevent switching exams before submitting
    if (activeView === 'exam' && !isSubmitted && currentExam?.id !== examId) {
      set({ isSubmitModalOpen: true });
      soundEffects.playTimerAlert();
      useAnnouncerStore
        .getState()
        .announce(
          'An exam is currently in progress. You cannot leave or start another test before submitting this one. Please confirm submission.',
          'assertive',
          true
        );
      return;
    }

    const { availableExams, availablePracticeDrills } = get();
    const allAvailable = [
      ...availableExams,
      ...availablePracticeDrills,
      ...offlinePracticeStorage.bundledDrills,
    ];

    const testDetails =
      options?.testDetails ||
      resolveNotificationTestDetails({
        title: examId,
        message: examId,
      });

    const targetKey = (examId || '').trim();
    const targetLower = targetKey.toLowerCase();
    const cleanKey = targetKey
      .replace(/^new\s+(?:mock\s+test|practice\s+test|test)\s+published:\s*/i, '')
      .replace(/^(?:mock\s+test|practice\s+test|test):\s*/i, '')
      .trim();

    const dtId = (testDetails?.testId || '').trim();
    const dtCode = (testDetails?.code || '').trim();
    const dtTitle = (testDetails?.testTitle || '').trim();

    // Universal hierarchical matching that prioritizes exact matches across catalog
    const matchInList = (list: Exam[]): Exam | null => {
      // 1. Exact ID Match (MongoDB _id or custom id)
      if (dtId) {
        const found = list.find(
          (e) =>
            e.id.toLowerCase() === dtId.toLowerCase() ||
            String((e as any)._id).toLowerCase() === dtId.toLowerCase()
        );
        if (found) return found;
      }
      if (targetLower) {
        const found = list.find(
          (e) =>
            e.id.toLowerCase() === targetLower ||
            String((e as any)._id).toLowerCase() === targetLower
        );
        if (found) return found;
      }

      // 2. Exact Code Match (case-insensitive & whitespace/hyphen agnostic)
      const codeCandidates = [dtCode, targetKey, cleanKey].filter(Boolean);
      for (const candidate of codeCandidates) {
        const candNorm = candidate.toLowerCase().replace(/[-_\s]+/g, '');
        if (candNorm.length < 2) continue;
        const found = list.find((e) => {
          if (!e.code) return false;
          const eNorm = e.code.toLowerCase().replace(/[-_\s]+/g, '');
          return e.code.toLowerCase() === candidate.toLowerCase() || eNorm === candNorm;
        });
        if (found) return found;
      }

      // 3. Exact Title Match (case-insensitive & trimmed)
      const titleCandidates = [dtTitle, cleanKey, targetKey].filter((t) => t && t.length >= 2);
      for (const candidate of titleCandidates) {
        const candLower = candidate.toLowerCase().trim();
        const found = list.find((e) => e.title && e.title.toLowerCase().trim() === candLower);
        if (found) return found;
      }

      // 4. Substring Title Match (title contains candidate or candidate contains title)
      for (const candidate of titleCandidates) {
        const candLower = candidate.toLowerCase().trim();
        if (candLower.length >= 3) {
          const found = list.find((e) => {
            if (!e.title) return false;
            const eLower = e.title.toLowerCase().trim();
            return eLower.includes(candLower) || candLower.includes(eLower);
          });
          if (found) return found;
        }
      }

      return null;
    };

    let exam: Exam | null = matchInList(allAvailable);

    // If not found in current memory cache, refresh catalog from server and search again
    if (!exam) {
      await get().loadCatalog();
      const freshAll = [
        ...get().availableExams,
        ...get().availablePracticeDrills,
        ...offlinePracticeStorage.bundledDrills,
      ];
      exam = matchInList(freshAll);
    }

    // Determine target mode
    const isPracticeMode =
      forceMode === 'practice' ||
      testDetails?.testType === 'practice' ||
      Boolean(
        exam &&
        (get().availablePracticeDrills.some((e) => e.id === exam!.id || e.code === exam!.code) ||
          offlinePracticeStorage.bundledDrills.some((e) => e.id === exam!.id || e.code === exam!.code) ||
          (exam.id && (exam.id.includes('drill') || exam.id.includes('practice'))) ||
          (exam.code &&
            (exam.code.startsWith('PRACTICE-') ||
              exam.code.startsWith('DI-') ||
              exam.code.includes('DRILL') ||
              exam.code.includes('PO-02'))) ||
          exam.negativeMarking === 'No negative marking (Practice)' ||
          String(exam.negativeMarking) === '0')
      );

    const targetMode: 'exam' | 'practice' = forceMode || (isPracticeMode ? 'practice' : 'exam');

    const launchOfflineDrill = async (drillExam: Exam, drillQuestions: QuestionItem[]) => {
      const durationSec = (drillExam.durationMinutes || 30) * 60;
      const h = String(Math.floor(durationSec / 3600)).padStart(2, '0');
      const m = String(Math.floor((durationSec % 3600) / 60)).padStart(2, '0');
      const s = String(durationSec % 60).padStart(2, '0');

      set({
        currentExam: { ...drillExam, questions: drillQuestions },
        questions: drillQuestions,
        attemptId: null,
        expiresAtMs: null,
        currentIndex: 0,
        selectedOptions: {},
        markedForReview: {},
        visitedQuestions: { [drillQuestions[0].id]: true },
        examMode: 'practice',
        isSubmitted: false,
        submissionTime: null,
        serverReport: null,
        timeRemaining: durationSec,
        formattedTime: `${h}:${m}:${s}`,
        activeView: 'exam',
        activeSectionFilter: 'All',
        isPaletteOpen: false,
        isSubmitModalOpen: false,
        isSettingsOpen: false,
        isShortcutsOpen: false,
      });

      soundEffects.playNavigate();
      useAnnouncerStore
        .getState()
        .announce(
          `Starting Offline Practice Drill: ${drillExam.title}. Total ${drillQuestions.length} questions. Offline hints and solutions enabled. Question 1 loaded.`,
          'assertive',
          true
        );
    };

    // If completely offline in Practice mode, launch straight into offline practice without network delay
    if (isPracticeMode && typeof navigator !== 'undefined' && !navigator.onLine && exam) {
      const cached = await offlinePracticeStorage.getCachedDrillQuestions(exam.id, exam.code);
      if (cached && cached.length > 0) {
        await launchOfflineDrill(exam, cached);
        return;
      }
    }

    // Determine the exact ID to send to server startAttempt
    // The verified exam from the catalog has the authoritative MongoDB id!
    const targetExamId =
      exam?.id ||
      (dtId && dtId.length === 24 ? dtId : null) ||
      exam?.code ||
      dtCode ||
      exam?.title ||
      dtTitle ||
      cleanKey ||
      examId;

    const requestOptions = {
      code: exam?.code || dtCode || undefined,
      title: exam?.title || dtTitle || undefined,
    };

    let started: StartAttemptResult;
    try {
      started = await getDataSource().exams.startAttempt(targetExamId, targetMode, requestOptions);
      if (targetMode === 'practice' && started.questions?.length) {
        void offlinePracticeStorage.cacheDrillQuestions(targetExamId, started.questions as unknown as QuestionItem[]);
        if (started.exam?.code) {
          void offlinePracticeStorage.cacheDrillQuestions(started.exam.code, started.questions as unknown as QuestionItem[]);
        }
      }
    } catch (err) {
      // If server could not start this exam, try offline cached practice if applicable
      if (targetMode === 'practice' && exam) {
        const cachedQuestions = await offlinePracticeStorage.getCachedDrillQuestions(exam.id, exam.code);
        if (cachedQuestions && cachedQuestions.length > 0) {
          await launchOfflineDrill(exam, cachedQuestions);
          return;
        }
      }

      // Check if user made a generic "mock test" request (not a specific test name/id)
      const isGenericRequest =
        !cleanKey ||
        cleanKey === 'mock' ||
        cleanKey === 'mock test' ||
        cleanKey === 'test' ||
        cleanKey === 'new test' ||
        cleanKey === 'latest' ||
        cleanKey === 'latest test' ||
        cleanKey === 'new mock test';

      if (isGenericRequest && !testDetails) {
        const fallbackList =
          targetMode === 'practice'
            ? [...get().availablePracticeDrills, ...offlinePracticeStorage.bundledDrills]
            : get().availableExams;
        if (fallbackList.length > 0 && fallbackList[0].id !== targetExamId) {
          return get().selectExam(fallbackList[0].id, targetMode, options);
        }
      }

      soundEffects.playTimerAlert();
      useAnnouncerStore
        .getState()
        .announce(
          err instanceof Error ? err.message : 'Could not start the requested examination.',
          'assertive',
          true
        );
      return;
    }

    // In api mode the server owns the clock; the Web Worker then only keeps the
    // display ticking smoothly between heartbeats.
    const remaining = started.clock.remainingSeconds;
    const h = String(Math.floor(remaining / 3600)).padStart(2, '0');
    const m = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');

    const questions = started.questions as unknown as QuestionItem[];

    // Never navigate into an exam the server gave no questions for. The server
    // refuses to start an empty exam, so this should be unreachable — but the
    // screen it produces is a dead end, and an explicit message beats it.
    if (questions.length === 0) {
      useAnnouncerStore
        .getState()
        .announce(
          `${started.exam?.title || exam?.title || 'This examination'} has no questions yet. Please contact your administrator.`,
          'assertive',
          true
        );
      return;
    }

    // The authoritative exam is the one started by the server!
    const effectiveExam: Exam = {
      ...(started.exam as unknown as Exam),
      questions,
    };

    // If this exam wasn't in availableExams / availablePracticeDrills, add it now
    if (targetMode === 'practice') {
      if (!get().availablePracticeDrills.some((e) => e.id === effectiveExam.id)) {
        set((state) => ({ availablePracticeDrills: [effectiveExam, ...state.availablePracticeDrills] }));
      }
    } else {
      if (!get().availableExams.some((e) => e.id === effectiveExam.id)) {
        set((state) => ({ availableExams: [effectiveExam, ...state.availableExams] }));
      }
    }

    set({
      currentExam: effectiveExam,
      questions,
      attemptId: started.attemptId,
      expiresAtMs: new Date(started.clock.expiresAt).getTime(),
      currentIndex: started.state?.currentIndex ?? 0,
      selectedOptions: started.state?.selectedOptions ?? {},
      markedForReview: started.state?.markedForReview ?? {},
      visitedQuestions: started.state?.visitedQuestions ?? (questions.length > 0 ? { [questions[0].id]: true } : {}),
      examMode: started.questions[0]?.hint !== undefined ? 'practice' : targetMode,
      isSubmitted: false,
      submissionTime: null,
      serverReport: null,
      timeRemaining: remaining,
      formattedTime: `${h}:${m}:${s}`,
      activeView: 'exam',
      activeSectionFilter: 'All',
      isPaletteOpen: false,
      isSubmitModalOpen: false,
      isSettingsOpen: false,
      isShortcutsOpen: false,
    });

    soundEffects.playNavigate();
    const mode = get().examMode;
    const speechMsg =
      mode === 'practice'
        ? `Starting Practice Drill: ${effectiveExam.title}. Total ${questions.length} questions. Helpful Hints and Step-by-Step Solutions are enabled. Question 1 loaded.`
        : `Starting ${effectiveExam.title}. Total ${questions.length} questions. Time limit: ${effectiveExam.durationMinutes} minutes. Question 1 loaded.`;

    // Skipped when the caller has already said its own piece. Every
    // announcement interrupts the last, so two of them for one action means the
    // first is cut off part-way through.
    if (options?.announce !== false) {
      useAnnouncerStore.getState().announce(speechMsg, 'assertive', true);
    }
  },

  /**
   * Pushes the current progress to the server immediately.
   *
   * Normally the automatic debounced save below handles this, so components do
   * not call it. It exists for the flush that must happen right before submit.
   */
  persistState: () => {
    const { attemptId } = get();
    if (!attemptId) return;
    const s = get();
    void getDataSource()
      .exams.saveState(attemptId, {
        currentIndex: s.currentIndex,
        selectedOptions: s.selectedOptions,
        markedForReview: s.markedForReview,
        visitedQuestions: s.visitedQuestions,
      })
      .catch(() => {
        // Best-effort; submit sends the authoritative copy anyway.
      });
  },

  returnToCatalog: () => {
    const { activeView, isSubmitted } = get();

    // STRICT INTEGRITY: Cannot leave an active mock test or practice exam before submitting it
    if (activeView === 'exam' && !isSubmitted) {
      set({ isSubmitModalOpen: true });
      soundEffects.playTimerAlert();
      useAnnouncerStore
        .getState()
        .announce(
          'You cannot go back before submitting the exam. Submit confirmation modal is open. Please submit your test first.',
          'assertive',
          true
        );
      return;
    }

    set({
      activeView: 'catalog',
      portalTab: 'exams',
      isSubmitted: false,
      isPaletteOpen: false,
      isSubmitModalOpen: false,
      isSettingsOpen: false,
      isShortcutsOpen: false,
    });
    soundEffects.playNavigate();
    useAnnouncerStore
      .getState()
      .announce(
        'Returned to Examination Catalog. All available mock tests are ready for you. Say "Start SSC CGL" or "Start Exam 1" to begin.',
        'polite',
        true
      );
  },

  openAnalytics: () => {
    const { activeView, isSubmitted } = get();

    // STRICT INTEGRITY: Cannot open analytics during active unsubmitted exam
    if (activeView === 'exam' && !isSubmitted) {
      set({ isSubmitModalOpen: true });
      soundEffects.playTimerAlert();
      useAnnouncerStore
        .getState()
        .announce(
          'You cannot navigate away to analytics during an active test. Please submit your exam first.',
          'assertive',
          true
        );
      return;
    }

    set({
      activeView: 'analytics',
      isSubmitted: false,
      isPaletteOpen: false,
      isSubmitModalOpen: false,
    });
    soundEffects.playSelect();
    useAnnouncerStore
      .getState()
      .announce(
        'Opened Student Performance Analytics Dashboard. Press B or Escape to return to tests.',
        'assertive',
        true
      );
  },

  submitExam: async () => {
    const { currentExam, examMode, attemptId, isSubmitting } = get();
    if (isSubmitting) return;

    if (autosaveTimer !== null) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }

    set({ isSubmitting: true });

    let report: GradeResult | null = null;
    try {

    if (attemptId) {
      try {
        // Authoritative grading. The server holds the answer key, so the score
        // shown to the student is the server's, never the browser's.
        // Send final selected options directly with the submit call so debounced autosaves don't drop answers.
        const finalState = {
          currentIndex: get().currentIndex,
          selectedOptions: get().selectedOptions,
          markedForReview: get().markedForReview,
          visitedQuestions: get().visitedQuestions,
        };
        report = await getDataSource().exams.submitAttempt(attemptId, finalState);
      } catch (err) {
        if (examMode === 'practice') {
          console.warn('[OfflinePractice] Server submit failed (offline). Evaluating practice drill locally:', err);
          report = null;
        } else {
          useAnnouncerStore
            .getState()
            .announce(
              err instanceof Error
                ? `Could not submit: ${err.message}`
                : 'Could not submit this examination. Please try again.',
              'assertive',
              true
            );
          return;
        }
      }
    }

    // Offline mode still grades locally, because there is no server to ask.
    if (!report) {
      // If questions in state are missing correctOption (e.g. attempt was started online then went offline),
      // enrich them from cached/bundled drill questions so local grading has the complete answer key
      let currentQuestions = get().questions;
      if (examMode === 'practice' && currentQuestions.some((q) => q.correctOption === undefined)) {
        const fullQuestions = await offlinePracticeStorage.getCachedDrillQuestions(currentExam.id, currentExam.code);
        if (fullQuestions && fullQuestions.length) {
          const map = new Map(fullQuestions.map((q) => [q.id, q]));
          currentQuestions = currentQuestions.map((q) => {
            const full = map.get(q.id);
            return full
              ? {
                  ...q,
                  correctOption: full.correctOption,
                  explanation: full.explanation,
                  hint: full.hint,
                }
              : q;
          });
          set({ questions: currentQuestions });
        }
      }

      const local = get().getDiagnosticReport();
      report = {
        ...local,
        attemptId: attemptId ?? 'local',
        examTitle: local.examTitle,
        status: 'submitted',
        questions: (get().questions.length ? get().questions : currentQuestions) as unknown as GradeResult['questions'],
      } as GradeResult;
    }

    const authoritativeAttemptId =
      attemptId && attemptId !== 'local'
        ? attemptId
        : report?.attemptId && report.attemptId !== 'local'
        ? report.attemptId
        : `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const activeStudent = useAuthStore.getState().currentStudent;
    const resolvedStudent = activeStudent || {
      id: 'std-guest',
      name: 'Guest Candidate',
      rollNumber: 'DX-GUEST',
    };

    if (examMode === 'practice') {
      void offlinePracticeStorage.saveOfflineSubmission({
        id: authoritativeAttemptId,
        examId: currentExam.id,
        examTitle: currentExam.title,
        examCode: currentExam.code,
        score: report.totalScore,
        maxScore: report.maxScore,
        percentage: report.scorePercentage,
        correctCount: report.correctCount,
        incorrectCount: report.incorrectCount,
        unattemptedCount: report.unattemptedCount,
        mode: 'practice',
        studentId: resolvedStudent.id,
        studentRoll: resolvedStudent.rollNumber,
        studentName: resolvedStudent.name,
        submittedAt: Date.now(),
      });
    }

    soundEffects.playSuccess();

    // The server's graded questions now legitimately carry correctOption and
    // explanation, so swapping them in lets DiagnosticReport work unchanged.
    if (report.questions?.length) {
      set({ questions: report.questions as unknown as QuestionItem[] });
    }

    useAuthStore.getState().addSubmission({
      id: authoritativeAttemptId,
      examId: currentExam.id,
      examTitle: currentExam.title,
      examCode: currentExam.code,
      examType: examMode,
      score: report.totalScore,
      maxScore: report.maxScore,
      percentage: report.scorePercentage,
      correctCount: report.correctCount,
      incorrectCount: report.incorrectCount,
      unattemptedCount: report.unattemptedCount,
    });

    // Instant real-time synchronization:
    // Update live currentAnalytics snapshot immediately so voice assistant & screen reader reflect accurate marks
    const initialSubs = useAuthStore.getState().submissions;
    const studentKey = (activeStudent?.rollNumber || activeStudent?.id || '').trim().toLowerCase();
    const clearedAt = getStudentClearedTimestamp(studentKey);
    const dismissedIds = getStudentDismissedIds(studentKey);

    const myInitialSubs = initialSubs.filter((s) => {
      if (!matchesStudent(s, activeStudent)) return false;
      if (clearedAt && s.submittedAt <= clearedAt) return false;
      if (dismissedIds.has(s.id)) return false;
      return true;
    });
    set({ currentAnalytics: computeAnalyticsSnapshot(myInitialSubs) });

    // Background server sync to maintain authoritative state without blocking user
    void useAuthStore.getState().syncSubmissions().then(() => {
      const freshSubs = useAuthStore.getState().submissions;
      const myFreshSubs = freshSubs.filter((s) => {
        if (!matchesStudent(s, activeStudent)) return false;
        if (clearedAt && s.submittedAt <= clearedAt) return false;
        if (dismissedIds.has(s.id)) return false;
        return true;
      });
      set({ currentAnalytics: computeAnalyticsSnapshot(myFreshSubs) });
    });

    set({
      isSubmitted: true,
      isSubmitModalOpen: false,
      submissionTime: Date.now(),
      serverReport: report,
      feedback: {
        isOpen: false,
        rating: 0,
        tags: [],
        comment: '',
        inputMethod: 'keyboard',
        isSubmitting: false,
        isSubmitted: false,
      },
    });

    const verbalDetails =
      report.verbalSummary && report.verbalSummary.length > 0
        ? report.verbalSummary.join(' ')
        : `Overall Score: ${report.totalScore} out of ${report.maxScore} points (${report.scorePercentage}% correct). Attempted: ${report.attemptedCount} of ${report.totalQuestions} questions (${report.correctCount} correct, ${report.incorrectCount} incorrect). Unattempted: ${report.unattemptedCount} questions.`;

    const fullResultAnnouncement = `Exam successfully submitted! Here is your performance diagnostic and analytics report for ${report.examTitle}: You scored ${report.totalScore} out of ${report.maxScore} maximum points, which is ${report.scorePercentage} percent. ${verbalDetails} You can say "Read summary" to hear this again, "Retake test", or "Choose another exam".`;

    useAnnouncerStore.getState().announce(
      fullResultAnnouncement,
      'assertive',
      true
    );
    // Prompt for candidate feedback after the diagnostic report announcement
    setTimeout(() => {
      const s = get();
      if (s.isSubmitted && !s.feedback.isSubmitted && s.activeView === 'exam') {
        s.openFeedbackModal();
      }
    }, 6000);
    } finally {
      set({ isSubmitting: false });
    }
  },

  addNewExam: async (newExam: Exam, mode: 'exam' | 'practice') => {
    let created: ExamSummary | undefined;
    try {
      // The data source decides where this lands. Publishing has to go through
      // the server or no student would ever see the exam.
      created = await getDataSource().exams.createExam(newExam, mode);
      await get().loadCatalog();
    } catch (err) {
      // The caller needs this text, not just a boolean: "it may already exist,
      // or the server rejected it" leaves an examiner guessing at which field
      // was wrong when the server has already said so.
      const message = err instanceof Error ? err.message : 'The server rejected the examination.';
      useAnnouncerStore
        .getState()
        .announce(`Could not publish the examination: ${message}`, 'assertive', true);
      return { ok: false, message };
    }

    try {
      authBroadcastChannel?.postMessage({
        type: 'CATALOG_UPDATED',
        examId: created?.id || newExam.id,
        timestamp: Date.now(),
      });
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dristix:catalog-updated', { detail: { examId: created?.id || newExam.id } })
      );
    }

    soundEffects.playSuccess();
    useAnnouncerStore
      .getState()
      .announce(`New examination "${newExam.title}" published successfully.`, 'assertive', true);
    return { ok: true, exam: created };
  },

  loadExamForEdit: async (examId: string) => {
    try {
      const exam = await getDataSource().exams.getExamForEdit(examId);
      return exam;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not fetch exam for editing.';
      useAnnouncerStore.getState().announce(message, 'assertive', true);
      return null;
    }
  },

  updateExistingExam: async (examId: string, updatedExam: Exam, mode: 'exam' | 'practice') => {
    let updated: ExamSummary | undefined;
    try {
      updated = await getDataSource().exams.updateExam(examId, updatedExam, mode);
      await get().loadCatalog();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The server rejected the examination update.';
      useAnnouncerStore
        .getState()
        .announce(`Could not update the examination: ${message}`, 'assertive', true);
      return { ok: false, message };
    }

    try {
      authBroadcastChannel?.postMessage({
        type: 'CATALOG_UPDATED',
        examId,
        timestamp: Date.now(),
      });
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dristix:catalog-updated', { detail: { examId } })
      );
    }

    soundEffects.playSuccess();
    useAnnouncerStore
      .getState()
      .announce(`Examination "${updatedExam.title}" updated successfully.`, 'assertive', true);
    return { ok: true, exam: updated };
  },

  deleteCustomExam: async (examId: string) => {
    try {
      await getDataSource().exams.deleteExam(examId);
    } catch (err) {
      useAnnouncerStore
        .getState()
        .announce(
          err instanceof Error
            ? `Could not remove the examination: ${err.message}`
            : 'Could not remove the examination.',
          'assertive',
          true
        );
      return;
    }

    // Re-read from the source rather than patching local state, so a server
    // delete that also removed attempts stays consistent.
    await get().loadCatalog();

    if (!get().currentExam.id) {
      set({ currentExam: EMPTY_EXAM, questions: [] });
    }

    try {
      authBroadcastChannel?.postMessage({
        type: 'CATALOG_UPDATED',
        examId,
        deleted: true,
        timestamp: Date.now(),
      });
      authBroadcastChannel?.postMessage({
        type: 'SUBMISSION_UPDATED',
        timestamp: Date.now(),
      });
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dristix:catalog-updated', { detail: { examId, deleted: true } })
      );
      window.dispatchEvent(new CustomEvent('dristix:submission-updated'));
    }
    void useAuthStore.getState().syncSubmissions();

    soundEffects.playSelect();
    useAnnouncerStore.getState().announce('Examination removed from catalog.', 'polite', true);
  },

  resetExam: () => {
    const { currentExam, questions } = get();

    // There is nothing to retake unless a question set is actually loaded.
    //
    // This used to set activeView to 'exam' unconditionally, which navigated to
    // the exam screen with an empty `questions` array whenever it was triggered
    // from the catalog — via a voice intent or the retake shortcut — producing
    // "No Questions Found". Staying put is the honest response.
    if (questions.length === 0) {
      useAnnouncerStore
        .getState()
        .announce(
          'There is no examination to retake yet. Open a test from the catalog first.',
          'assertive',
          true
        );
      return;
    }

    const durationSec = currentExam.durationMinutes * 60;
    const h = String(Math.floor(durationSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((durationSec % 3600) / 60)).padStart(2, '0');

    set({
      currentIndex: 0,
      selectedOptions: {},
      markedForReview: {},
      visitedQuestions: questions.length > 0 ? { [questions[0].id]: true } : {},
      isSubmitted: false,
      submissionTime: null,
      timeRemaining: durationSec,
      formattedTime: `${h}:${m}:00`,
      activeView: 'exam',
    });
    useAnnouncerStore
      .getState()
      .announce(`Examination reset for ${currentExam.title}. Ready to start.`, 'polite', true);
  },

  announceCurrentQuestion: (speakTTS = true, includeOptions = true) => {
    const { currentIndex, questions, selectedOptions, markedForReview } = get();
    const currentQ = questions[currentIndex];
    const isMarked = markedForReview[currentQ.id];
    const selectedOpt = selectedOptions[currentQ.id];

    let msg = `Question ${currentQ.questionNumber} of ${questions.length}. Section: ${currentQ.section}. ${verbalizeForSpeech(currentQ.questionText)}. `;
    if (currentQ.mathLatex) {
      msg += `Equation: ${verbalizeMath(currentQ.mathLatex)}. `;
    }
    const hasValidExpl = hasValidAiExplanation(currentQ.diagramAiExplanation);
    if (hasValidExpl && currentQ.diagramAiExplanation?.audioNarration) {
      msg += `Visual Diagram Breakdown: ${currentQ.diagramAiExplanation.audioNarration}. `;
    } else if (currentQ.diagramDescription) {
      msg += `Visual Diagram: ${currentQ.diagramDescription}. `;
    } else if (currentQ.diagramUrl) {
      msg += `This question includes an attached visual diagram or chart. AI Diagram Breakdown and Voice Guide are available. Say "Explain diagram" to hear the full visual breakdown. `;
      void get().explainCurrentDiagram(false);
    }
    if (currentQ.graph && currentQ.graph.enabled && currentQ.graph.data?.length) {
      const g = currentQ.graph;
      const unit = g.unit ? ` ${g.unit}` : '';
      const dataStr = g.data.map((d) => `${d.label}: ${d.value}${unit}`).join(', ');
      msg += `This question includes an interactive audio ${g.type} chart titled "${g.title || 'Data Graph'}". Chart data points are: ${dataStr}. You can press Left and Right arrow keys on the chart to hear the pitch tones, or say "play graph" for a guided audio tour. `;
    }

    if (includeOptions && currentQ.options && currentQ.options.length > 0) {
      msg += `Options are: `;
      currentQ.options.forEach((opt) => {
        const mathVerbal = opt.mathLatex ? verbalizeMath(opt.mathLatex).trim() : '';
        const rawText = opt.text ? opt.text.trim() : '';
        let optCombined = rawText;
        if (mathVerbal) {
          const normRaw = rawText.toLowerCase().replace(/\s+/g, ' ');
          const normMath = mathVerbal.toLowerCase().replace(/\s+/g, ' ');
          if (normRaw && (normRaw.includes(normMath) || normMath.includes(normRaw))) {
            optCombined = rawText || mathVerbal;
          } else if (rawText) {
            optCombined = `${rawText}, ${mathVerbal}`;
          } else {
            optCombined = mathVerbal;
          }
        }
        const optText = verbalizeForSpeech(optCombined);
        msg += `Option ${opt.number}: ${optText}. `;
      });
    }

    if (selectedOpt) {
      msg += `Currently selected: Option ${selectedOpt}. `;
    } else {
      msg += `Not yet answered. `;
    }
    if (isMarked) {
      msg += `Marked for review.`;
    }

    useAnnouncerStore.getState().announce(msg, 'polite', speakTTS);
  },

  /**
   * Voice-assistant entry point for "read question". Assertive priority and TTS
   * are forced on so the spoken answer is not swallowed by polite live regions.
   */
  readCurrentQuestion: () => {
    const { currentIndex, questions } = get();
    const currentQ = questions[currentIndex];
    if (!currentQ) {
      useAnnouncerStore
        .getState()
        .announce('There is no question loaded right now.', 'assertive', true);
      return;
    }
    get().announceCurrentQuestion(true, true);
  },

  /**
   * Explains the visual diagram or chart for the currently active question using multimodal AI Vision.
   * Narrates step-by-step points, shapes, axes, labels, and educational context for visually impaired students.
   */
  explainCurrentDiagram: async (autoSpeak = true) => {
    const { currentIndex, questions } = get();
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    if (!currentQ.diagramUrl && !currentQ.diagramDescription) {
      if (autoSpeak) {
        useAnnouncerStore
          .getState()
          .announce(
            `Question ${currentQ.questionNumber} does not have an attached visual diagram or chart.`,
            'assertive',
            true
          );
      }
      return;
    }

    if (hasValidAiExplanation(currentQ.diagramAiExplanation)) {
      if (autoSpeak) {
        const expl = currentQ.diagramAiExplanation!;
        const speech = `AI Diagram Breakdown for Question ${currentQ.questionNumber}. ${
          expl.audioNarration || expl.educationalContext
        }. ${expl.visualBreakdown?.length ? `Visual elements: ${expl.visualBreakdown.join('. ')}.` : ''}`;
        useAnnouncerStore.getState().announce(speech, 'assertive', true);
      }
      return;
    }

    if (autoSpeak) {
      useAnnouncerStore
        .getState()
        .announce(
          `AI Multimodal Vision is analyzing the visual diagram for Question ${currentQ.questionNumber}...`,
          'assertive',
          true
        );
    }

    try {
      const res = await getDataSource().ai.explainDiagram({
        questionText: currentQ.questionText,
        mathLatex: currentQ.mathLatex,
        diagramUrl: currentQ.diagramUrl,
        diagramType: currentQ.diagramType || 'image',
        diagramDescription: currentQ.diagramDescription,
      });

      if (res && hasValidAiExplanation(res)) {
        const updated = [...get().questions];
        updated[currentIndex] = { ...updated[currentIndex], diagramAiExplanation: res };
        set({ questions: updated });

        if (autoSpeak && get().currentIndex === currentIndex) {
          const speech = `AI Diagram Breakdown for Question ${currentQ.questionNumber}. ${
            res.audioNarration || res.educationalContext
          }. ${res.visualBreakdown?.length ? `Visual elements: ${res.visualBreakdown.join('. ')}.` : ''}`;
          useAnnouncerStore.getState().announce(speech, 'assertive', true);
        }
      }
    } catch (err: any) {
      console.warn('[dristix] explainCurrentDiagram error:', err);
      if (autoSpeak && get().currentIndex === currentIndex) {
        const fallback = currentQ.diagramDescription
          ? `Visual Diagram for Question ${currentQ.questionNumber}: ${currentQ.diagramDescription}.`
          : `Visual diagram is attached for Question ${currentQ.questionNumber}.`;
        useAnnouncerStore.getState().announce(fallback, 'assertive', true);
      }
    }
  },

  /**
   * Voice-assistant entry point for "how much time is left".
   */
  readTimer: () => {
    const { timeRemaining, formattedTime, isSubmitted } = get();
    const isHindi = isHindiPreferred();
    if (isSubmitted) {
      useAnnouncerStore
        .getState()
        .announce(
          isHindi
            ? 'यह परीक्षा पहले ही सबमिट हो चुकी है, इसलिए टाइमर अब नहीं चल रहा है।'
            : 'This test has already been submitted, so the timer is no longer running.',
          'assertive',
          true
        );
      return;
    }
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    useAnnouncerStore
      .getState()
      .announce(
        isHindi
          ? `शेष समय: ${minutes} मिनट और ${seconds} सेकंड। टाइमर: ${formattedTime}।`
          : `Time remaining: ${minutes} minutes and ${seconds} seconds. Timer display: ${formattedTime}.`,
        'assertive',
        true
      );
  },

  getDiagnosticReport: (): DiagnosticReportData => {
    // In api mode the grade was computed on the server. Returning it keeps a
    // single source of truth, and avoids recomputing a score the client has no
    // answer key to compute correctly.
    const server = get().serverReport;
    if (server) {
      return {
        examTitle: server.examTitle,
        totalQuestions: server.totalQuestions,
        attemptedCount: server.attemptedCount,
        correctCount: server.correctCount,
        incorrectCount: server.incorrectCount,
        unattemptedCount: server.unattemptedCount,
        markedCount: server.markedCount,
        scorePercentage: server.scorePercentage,
        totalScore: server.totalScore,
        maxScore: server.maxScore,
        sectionDiagnostics: server.sectionDiagnostics,
        verbalSummary: server.verbalSummary,
        weakAreas: server.weakAreas,
        strongAreas: server.strongAreas,
      };
    }

    const { currentExam, questions, selectedOptions, markedForReview } = get();
    const totalQuestions = questions.length;
    let attemptedCount = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let markedCount = 0;

    const sectionMap: Record<string, { total: number; attempted: number; correct: number }> = {};

    questions.forEach((q) => {
      if (!sectionMap[q.section]) {
        sectionMap[q.section] = { total: 0, attempted: 0, correct: 0 };
      }
      sectionMap[q.section].total++;

      if (markedForReview[q.id]) {
        markedCount++;
      }

      const userAns = selectedOptions[q.id];
      if (userAns !== undefined) {
        attemptedCount++;
        sectionMap[q.section].attempted++;
        if (userAns === q.correctOption) {
          correctCount++;
          sectionMap[q.section].correct++;
        } else {
          incorrectCount++;
        }
      }
    });

    const unattemptedCount = Math.max(0, totalQuestions - attemptedCount);
    const scorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const marksPerQuestion = totalQuestions > 0 && currentExam.totalMarks ? (currentExam.totalMarks / totalQuestions) : 1;
    const isPracticeMode = get().examMode === 'practice';
    const negMark = isPracticeMode ? 0 : (currentExam.negativeMarking ? Math.abs(parseFloat(currentExam.negativeMarking)) || 0 : 0);
    const totalScore = Number(Math.max(0, correctCount * marksPerQuestion - (isPracticeMode ? 0 : incorrectCount * negMark)).toFixed(2));
    const maxScore = currentExam.totalMarks || (totalQuestions * (marksPerQuestion || 1));

    const sectionDiagnostics: SectionDiagnostic[] = Object.entries(sectionMap).map(
      ([secName, stats]) => ({
        section: secName,
        total: stats.total,
        attempted: stats.attempted,
        correct: stats.correct,
        accuracy: stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0,
      })
    );

    const weakAreas: string[] = [];
    const strongAreas: string[] = [];

    sectionDiagnostics.forEach((s) => {
      if (s.attempted === 0 || s.accuracy < 60) {
        weakAreas.push(`${s.section} (Accuracy: ${s.accuracy}%)`);
      } else {
        strongAreas.push(`${s.section} (Accuracy: ${s.accuracy}%)`);
      }
    });

    const verbalSummary: string[] = [
      `Overall Score: ${totalScore} out of ${maxScore} maximum points (${scorePercentage}% correct).`,
      `Attempted: ${attemptedCount} of ${totalQuestions} questions (${correctCount} correct, ${incorrectCount} incorrect).`,
      `Unattempted: ${unattemptedCount} questions.`,
      `Marked for review during exam: ${markedCount} questions.`,
      weakAreas.length > 0
        ? `Focus areas recommended for practice: ${weakAreas.join(', ')}.`
        : `Excellent performance across all sections.`,
    ];

    return {
      examTitle: currentExam.title,
      totalQuestions,
      attemptedCount,
      correctCount,
      incorrectCount,
      unattemptedCount,
      markedCount,
      scorePercentage,
      totalScore,
      maxScore,
      sectionDiagnostics,
      verbalSummary,
      weakAreas,
      strongAreas,
    };
  },
}));

/**
 * Debounced autosave.
 *
 * Option clicks, navigation and mark-for-review all mutate local state
 * synchronously so the UI never waits on the network, and this subscriber
 * pushes a snapshot a moment after the student stops interacting. Subscribing
 * rather than calling a save from each action means a newly added mutation
 * cannot silently forget to persist.
 *
 * The server merges each patch, so a dropped request never loses earlier
 * answers, and submit sends an authoritative copy regardless.
 */
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

useExamStore.subscribe((state, prev) => {
  if (!state.attemptId) return;
  if (state.activeView !== 'exam' || state.isSubmitted) return;

  const changed =
    state.selectedOptions !== prev.selectedOptions ||
    state.markedForReview !== prev.markedForReview ||
    state.visitedQuestions !== prev.visitedQuestions ||
    state.currentIndex !== prev.currentIndex;
  if (!changed) return;

  if (autosaveTimer !== null) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    const s = useExamStore.getState();
    if (!s.attemptId) return;
    void getDataSource()
      .exams.saveState(s.attemptId, {
        currentIndex: s.currentIndex,
        selectedOptions: s.selectedOptions,
        markedForReview: s.markedForReview,
        visitedQuestions: s.visitedQuestions,
      })
      .catch(() => {
        // Best-effort. The next change retries; submit sends the final copy.
      });
  }, 1200);
});

// Automatic synchronization listeners across tabs and window events for analytics and catalog
if (typeof window !== 'undefined') {
  const syncLiveSnapshot = () => {
    const activeStudent = useAuthStore.getState().currentStudent;
    const subs = useAuthStore.getState().submissions;
    const studentKey = (activeStudent?.rollNumber || activeStudent?.id || '').trim().toLowerCase();
    const clearedAt = getStudentClearedTimestamp(studentKey);
    const dismissedIds = getStudentDismissedIds(studentKey);

    const mySubs = subs.filter((s) => {
      if (!matchesStudent(s, activeStudent)) return false;
      if (clearedAt && s.submittedAt <= clearedAt) return false;
      if (dismissedIds.has(s.id)) return false;
      return true;
    });
    useExamStore.getState().setCurrentAnalytics(computeAnalyticsSnapshot(mySubs));
  };

  window.addEventListener('dristix:submission-deleted', syncLiveSnapshot);
  window.addEventListener('dristix:student-history-cleared', syncLiveSnapshot);
  window.addEventListener('dristix:submission-updated', syncLiveSnapshot);
  window.addEventListener('dristix:catalog-updated', () => {
    void useExamStore.getState().loadCatalog();
  });
}

if (typeof window !== 'undefined') {
  (window as any).__dristix_exam_store = useExamStore;
}
