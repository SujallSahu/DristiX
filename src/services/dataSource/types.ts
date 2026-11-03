import type { Exam } from '../../../shared/types';
import type {
  AiChatRequest,
  AiChatResponse,
  AttemptClock,
  AttemptSummary,
  AuthResult,
  ExamSummary,
  GradeResult,
  PublicQuestion,
  StartAttemptResult,
  TranscribeResult,
  UserProfile,
} from '../../../shared/types';

/**
 * The seam between the UI and wherever data actually lives.
 *
 * Components never call `fetch` or `localStorage` directly for exam data. They
 * go through a data source, and which one is active is decided once at startup
 * by `VITE_DATA_SOURCE`. That is what lets the app run fully offline against
 * localStorage while the backend is being built, and switch to the API without
 * touching a single component.
 */


export interface AuthDataSource {
  login(identifier: string, password: string): Promise<AuthResult>;
  /**
   * Administrator sign-in. Separate from `login` because admins authenticate
   * with a short username, and the server verifies the role before issuing a
   * token that any admin route will accept.
   */
  adminLogin(username: string, password: string): Promise<AuthResult>;
  register(input: {
    name: string;
    email: string;
    rollNumber: string;
    password: string;
    accessibilityPreference?: string;
    inviteCode?: string;
  }): Promise<AuthResult>;
  logout(): Promise<void>;
  /** Resolves the current session on boot, or null when signed out. */
  restoreSession(): Promise<AuthResult | null>;
  getProfile(): Promise<UserProfile>;
  /**
   * The student roster. Admin-only on the server; in offline mode it reads the
   * locally seeded profiles.
   */
  listStudents(): Promise<UserProfile[]>;
  deleteStudent(studentId: string): Promise<void>;
  requestPasswordReset(identifier: string, portal: 'student' | 'admin'): Promise<{
    ok: boolean;
    success?: boolean;
    message: string;
    maskedEmail?: string;
    email?: string;
    devCode?: string;
  }>;
  verifyResetCode(email: string, code: string): Promise<{
    ok: boolean;
    success?: boolean;
    resetToken: string;
    message: string;
  }>;
  resetPassword(email: string, resetToken: string, newPassword: string): Promise<{
    ok: boolean;
    success?: boolean;
    message: string;
  }>;
}

export interface ExamDataSource {
  createExam(exam: Exam, mode: 'exam' | 'practice'): Promise<ExamSummary>;
  updateExam(examId: string, exam: Exam, mode: 'exam' | 'practice'): Promise<ExamSummary>;
  getExamForEdit(examId: string): Promise<Exam>;
  deleteExam(examId: string): Promise<void>;

  /**
   * The catalog, split into mock tests and practice drills, for the listing
   * screen. Entries carry metadata and `questionCount`; `questions` is empty
   * because the server withholds them — and the answer key — until an attempt
   * starts.
   */
  getFullCatalog(): Promise<{ exams: Exam[]; drills: Exam[] }>;
  listExams(): Promise<ExamSummary[]>;
  startAttempt(examId: string, mode: 'exam' | 'practice'): Promise<StartAttemptResult>;
  getQuestions(attemptId: string): Promise<{ questions: PublicQuestion[]; clock: AttemptClock }>;
  saveState(
    attemptId: string,
    state: {
      currentIndex?: number;
      selectedOptions?: Record<string, number>;
      markedForReview?: Record<string, boolean>;
      visitedQuestions?: Record<string, boolean>;
    }
  ): Promise<AttemptClock>;
  heartbeat(attemptId: string): Promise<AttemptClock>;
  submitAttempt(
    attemptId: string,
    state?: {
      currentIndex?: number;
      selectedOptions?: Record<string, number>;
      markedForReview?: Record<string, boolean>;
      visitedQuestions?: Record<string, boolean>;
    }
  ): Promise<GradeResult>;
  listAttempts(): Promise<AttemptSummary[]>;
  /**
   * Every student's attempts. Admin-only on the server; the offline
   * implementation just returns the student's own, since offline mode has no
   * shared cohort.
   */
  listAllSubmissions(): Promise<AttemptSummary[]>;
  deleteSubmission?(submissionId: string): Promise<void>;
  clearStudentSubmissions?(studentIdOrRoll: string): Promise<void>;
  clearStudentAttempts?(): Promise<void>;
  dismissStudentAttempt?(attemptId: string): Promise<void>;
  clearAllSubmissions?(): Promise<void>;
  submitFeedback(payload: {
    examId: string;
    examTitle: string;
    rating: number;
    tags?: string[];
    comment?: string;
    inputMethod?: 'voice' | 'keyboard' | 'mixed';
    studentRoll?: string;
    studentName?: string;
  }): Promise<{ ok: boolean; message: string }>;
}

export interface ExplainDiagramPayload {
  questionText: string;
  mathLatex?: string;
  diagramUrl?: string;
  diagramType?: string;
  diagramDescription?: string;
}

export interface AiDataSource {
  chat(request: AiChatRequest): Promise<AiChatResponse>;
  transcribe(
    audio: Blob,
    filename?: string,
    options?: { prompt?: string; language?: string }
  ): Promise<TranscribeResult>;
  explainDiagram(payload: ExplainDiagramPayload): Promise<import('../../../shared/types').AiDiagramExplanation>;
  /** False when no provider key is configured anywhere, so the UI can say so. */
  isConfigured(): boolean;
}

export interface DataSource {
  mode: 'api';
  auth: AuthDataSource;
  exams: ExamDataSource;
  ai: AiDataSource;
}
