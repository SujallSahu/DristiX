/**
 * Types shared by the DristiX frontend and the Node.js backend.
 *
 * This file is the security contract. The single most important type here is
 * `PublicQuestion` â€” it deliberately has NO `correctOption` and NO
 * `explanation`. The backend must never send those to a student before the
 * attempt is submitted. `GradedQuestion` is the only shape that carries them,
 * and it only ever comes back from `POST /api/attempts/:id/submit`.
 */

/* ------------------------------------------------------------------ */
/* Exam entities                                                       */
/* ------------------------------------------------------------------ */

export type ExamDifficulty = 'Easy' | 'Moderate' | 'Challenging';

/**
 * A question as the frontend model declares it.
 *
 * `correctOption`, `explanation` and `hint` are optional because the server
 * withholds them while an attempt is live: it sends only `PublicQuestion`, and
 * fills these in from `GradedQuestion` after submission. The single place
 * that relies on them being present is the diagnostic report, which only
 * renders post-submit.
 */
export interface AiDiagramExplanation {
  visualBreakdown: string[];
  educationalContext: string;
  keyPoints: string[];
  audioNarration: string;
}

export function hasValidAiExplanation(expl?: AiDiagramExplanation | null): boolean {
  if (!expl) return false;
  return Boolean(
    (typeof expl.audioNarration === 'string' && expl.audioNarration.trim().length > 0) ||
    (typeof expl.educationalContext === 'string' && expl.educationalContext.trim().length > 0) ||
    (Array.isArray(expl.visualBreakdown) && expl.visualBreakdown.length > 0 && expl.visualBreakdown.some((b) => b && b.trim().length > 0))
  );
}

export type DiagramType = 'image' | 'svg' | 'chart' | 'geometry';

export type QuestionType = 'MCQ' | 'DI';

export type GraphType = 'bar' | 'line' | 'pie';

export interface GraphDataPoint {
  id: string;
  label: string;
  value: number;
}

export interface GraphSonificationConfig {
  enabled: boolean;
  spatialAudio: boolean;
  trendDetection: boolean;
  peakDetection: boolean;
  haptic: boolean;
  voiceDetail?: 'minimal' | 'standard' | 'detailed';
  minFrequency?: number;
  maxFrequency?: number;
}

export interface QuestionGraph {
  enabled: boolean;
  type: GraphType;
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  unit?: string;
  data: GraphDataPoint[];
  sonification: GraphSonificationConfig;
}

export interface QuestionItem {
  id: string;
  section: string;
  questionNumber: number;
  questionText: string;
  questionType?: QuestionType;
  mathLatex?: string;
  diagramUrl?: string;
  diagramType?: DiagramType;
  diagramDescription?: string;
  diagramAiExplanation?: AiDiagramExplanation;
  graph?: QuestionGraph;
  options: { id: string; number: number; text: string; mathLatex?: string }[];
  correctOption?: number;
  explanation?: string;
  hint?: string;
}

export interface Exam {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  totalMarks: number;
  negativeMarking: string;
  difficulty: ExamDifficulty;
  sections: string[];

  /**
   * How many questions the exam holds. The catalog listing shows this, and the
   * browser is not sent the questions themselves â€” so `questions` is empty
   * there and this count is the only thing available.
   */
  questionCount: number;

  /**
   * Empty in a catalog listing: the server withholds questions, and with them
   * the answer key, until an attempt starts. Populated during an attempt, and
   * fully populated after submission.
   */
  questions: QuestionItem[];
}

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

export type UserRole = 'STUDENT' | 'ADMIN';

export type AccessibilityPreference =
  | 'Screen Reader'
  | 'High Contrast'
  | 'Low Vision'
  | 'Standard';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  rollNumber: string;
  role: UserRole;
  accessibilityPreference: AccessibilityPreference | null;
  isGoogleAuthenticated?: boolean;
  emailVerified?: boolean;
  createdAt?: string;
}

export type NotificationType = 'TEST_PUBLISHED' | 'CUSTOM' | 'ANNOUNCEMENT' | 'SYSTEM';

export interface NotificationTestDetails {
  testId?: string | null;
  testTitle?: string | null;
  testType?: 'exam' | 'practice' | 'Mock Test' | 'Practice Test' | null;
  code?: string | null;
  durationMinutes?: number | null;
  totalMarks?: number | null;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  testDetails?: NotificationTestDetails | null;
  targetType: 'ALL_STUDENTS' | 'SPECIFIC_STUDENTS';
  senderRole: 'ADMIN' | 'SYSTEM';
  senderName: string;
  createdAt: string;
  isRead?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
}

export interface AuthResult {
  user: UserProfile;
  tokens: AuthTokens;
}

/* ------------------------------------------------------------------ */
/* Questions â€” the sensitive/public split                              */
/* ------------------------------------------------------------------ */

export interface QuestionOption {
  id: string;
  number: number;
  text: string;
  mathLatex?: string;
}

/**
 * What the browser is allowed to receive while an attempt is in progress.
 * No answer key. No explanation.
 */
export interface PublicQuestion {
  id: string;
  section: string;
  questionNumber: number;
  questionText: string;
  questionType?: QuestionType;
  mathLatex?: string;
  diagramUrl?: string;
  diagramType?: DiagramType;
  diagramDescription?: string;
  diagramAiExplanation?: AiDiagramExplanation;
  graph?: QuestionGraph;
  options: QuestionOption[];
  /**
   * Practice mode only, and only when the attempt mode is 'practice'.
   * Never populated in 'exam' mode.
   */
  hint?: string;
}

/** The full record, including secrets. Server-side only. */
export interface ServerQuestion extends PublicQuestion {
  correctOption: number;
  explanation: string;
  hint: string;
}

/** Returned only after submission, when revealing answers is legitimate. */
export interface GradedQuestion extends PublicQuestion {
  selectedOption: number | null;
  correctOption: number;
  isCorrect: boolean;
  explanation: string;
  /** True when the student left this question unanswered. */
  unattempted: boolean;
}

/* ------------------------------------------------------------------ */
/* Exams                                                              */
/* ------------------------------------------------------------------ */

export type ExamMode = 'exam' | 'practice';

export interface ExamSummary {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  totalMarks: number;
  negativeMarking: string;
  difficulty: string;
  sections: string[];
  questionCount: number;
}

/* ------------------------------------------------------------------ */
/* Attempts                                                           */
/* ------------------------------------------------------------------ */

export type AttemptStatus = 'in_progress' | 'submitted' | 'expired';

/** Client-persisted progress, autosaved to the server. */
export interface AttemptState {
  currentIndex: number;
  selectedOptions: Record<string, number>;
  markedForReview: Record<string, boolean>;
  visitedQuestions: Record<string, boolean>;
}

export interface AttemptSummary {
  id: string;
  examId: string;
  examTitle: string;
  examCode: string;
  mode: ExamMode;
  status: AttemptStatus;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  unattemptedCount: number | null;
  /** Present only on the admin roster endpoint. */
  student?: { id?: string; name: string; rollNumber: string; email: string };
  studentId?: string;
}

/**
 * Server-authoritative clock. The client computes
 * `remaining = expiresAt - serverNow` and re-syncs on every heartbeat, so
 * closing the tab does not reset the clock and editing client state cannot
 * extend the exam.
 */
export interface AttemptClock {
  attemptId: string;
  serverNow: string;
  expiresAt: string;
  remainingSeconds: number;
  status: AttemptStatus;
}

export interface StartAttemptResult {
  attemptId: string;
  exam: ExamSummary;
  questions: PublicQuestion[];
  clock: AttemptClock;
  state?: AttemptState;
}

/* ------------------------------------------------------------------ */
/* Grading / results                                                  */
/* ------------------------------------------------------------------ */

export interface SectionDiagnostic {
  section: string;
  total: number;
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface GradeResult {
  attemptId: string;
  examTitle: string;
  status: AttemptStatus;
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
  /** Answer key â€” safe to send now, the attempt is over. */
  questions: GradedQuestion[];
}

/* ------------------------------------------------------------------ */
/* AI proxy                                                           */
/* ------------------------------------------------------------------ */

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiChatRequest {
  provider: 'gemini' | 'groq';
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiChatResponse {
  reply: string;
  /** Parsed intent/action when the model returns structured output. */
  action?: string;
  param?: string;
  provider: string;
  model: string;
}

/**
 * Speech-to-text result.
 *
 * Transcription happens on the server via the configured provider, rather than
 * through the browser's SpeechRecognition. The browser API streams audio to
 * Google's own speech service, which is unreachable from some networks and then
 * fails silently â€” recognition reports "aborted" with no audio ever arriving,
 * even while the microphone is demonstrably delivering sound.
 */
export interface TranscribeResult {
  text: string;
  provider: string;
  model: string;
  durationSeconds?: number;
}

/* ------------------------------------------------------------------ */
/* API envelope                                                       */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * Retained for callers that branch on it. DristiX now ships a single data
 * source (the API), so this always resolves to 'api' at runtime.
 */
export type DataSourceMode = 'api';
