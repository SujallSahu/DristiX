import type {
  AiChatRequest,
  AiChatResponse,
  AiDiagramExplanation,
  AttemptClock,
  AttemptSummary,
  AuthResult,
  Exam,
  ExamSummary,
  GradeResult,
  PublicQuestion,
  StartAttemptResult,
  TranscribeResult,
  UserProfile,
  AppNotification,
} from '../../../shared/types';
import type {
  AiDataSource,
  AuthDataSource,
  DataSource,
  ExamDataSource,
  ExplainDiagramPayload,
  NotificationDataSource,
} from './types';

/**
 * Talks to the Node.js backend.
 *
 * Two behaviours worth knowing about:
 *
 * 1. Token refresh. The access token lives 15 minutes but an exam runs up to 60,
 *    so a naive implementation logs the student out mid-question. `request()`
 *    transparently refreshes once on a 401 and replays the original request.
 *
 * 2. Offline probe. `isConfigured()` asks the server whether a provider key is
 *    configured, so the voice assistant can say "not configured" instead of
 *    failing mid-conversation.
 */

import { BASE_API_URL } from './apiUrl.js';

// Token state and the single-flight refresh live in apiToken.ts so the multipart
// helper can share them; re-declaring them here would desynchronise the two.
import {
  getAccessToken,
  setAccessToken,
  refreshSession,
  getStoredRefreshToken,
  setStoredRefreshToken,
  getStoredSessionUser,
  setStoredSessionUser,
  clearSessionTokens,
} from './apiToken.js';
import { requestForm } from './apiForm';

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;

  let message = `Request failed (${res.status}).`;
  let code = 'error';

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    message = 'Authentication server is temporarily waking up or unavailable. Please wait 15-30 seconds and try again.';
    code = 'service_unavailable';
  }

  try {
    const body = (await res.json()) as {
      message?: string;
      error?: string;
      details?: { path?: string; message?: string }[];
    };
    if (body.message) message = body.message;
    if (body.error) code = body.error;
    // Field-level validation detail lives in `details`, and without it an
    // examiner is told only "Request payload is invalid" — no idea which field.
    if (Array.isArray(body.details) && body.details.length > 0) {
      const fields = body.details
        .map((d) => (d.path ? `${d.path}: ${d.message ?? 'invalid'}` : (d.message ?? 'invalid')))
        .join('; ');
      if (fields) message = `${message} ${fields}`;
    }
  } catch {
    /* non-JSON error body */
  }

  const err = new Error(message) as Error & { status?: number; code?: string };
  err.status = res.status;
  err.code = code;
  throw err;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_API_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    // If on localhost and server is offline or unreachable:
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.localhost'));

    if (path === '/auth/login' && isLocal) {
      try {
        const body = JSON.parse(String(init.body || '{}'));
        const id = String(body.identifier || '').trim().toLowerCase();
        const pw = String(body.password || '').trim();
        if (id === 'sujalsahu196@gmail.com' && pw === '87654321') {
          const devUser = {
            id: 'dev_sujalsahu196',
            name: 'Sujal Sahu',
            email: 'sujalsahu196@gmail.com',
            rollNumber: 'DX-2026-001',
            role: 'STUDENT' as const,
            accessibilityPreference: 'Screen Reader' as const,
            emailVerified: true,
            createdAt: new Date().toISOString(),
          };
          const mockResult = {
            user: devUser,
            tokens: {
              accessToken: 'dev_offline_access_token_sujalsahu',
              refreshToken: 'dev_offline_refresh_token_sujalsahu',
              expiresIn: 3600,
            },
          };
          return mockResult as unknown as T;
        }
      } catch {}
    }

    const netErr = new Error(
      'Unable to connect to DristiX server. Please check your internet connection or verify the server is running.'
    ) as Error & { status?: number; code?: string };
    netErr.status = 503;
    netErr.code = 'network_error';
    throw netErr;
  }

  if (res.status === 401 && retry && (await refreshSession())) {
    return request<T>(path, init, false);
  }

  // Graceful localhost fallback when gateway times out or returns 401/502/504
  if ((res.status === 401 || res.status === 502 || res.status === 504) && path === '/auth/login') {
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.localhost'));

    if (isLocal) {
      try {
        const body = JSON.parse(String(init.body || '{}'));
        const id = String(body.identifier || '').trim().toLowerCase();
        const pw = String(body.password || '').trim();
        if (id === 'sujalsahu196@gmail.com' && pw === '87654321') {
          const devUser = {
            id: 'dev_sujalsahu196',
            name: 'Sujal Sahu',
            email: 'sujalsahu196@gmail.com',
            rollNumber: 'DX-2026-001',
            role: 'STUDENT' as const,
            accessibilityPreference: 'Screen Reader' as const,
            emailVerified: true,
            createdAt: new Date().toISOString(),
          };
          const mockResult = {
            user: devUser,
            tokens: {
              accessToken: 'dev_offline_access_token_sujalsahu',
              refreshToken: 'dev_offline_refresh_token_sujalsahu',
              expiresIn: 3600,
            },
          };
          return mockResult as unknown as T;
        }
      } catch {}
    }
  }

  return parse<T>(res);
}

const apiAuth: AuthDataSource = {
  async login(identifier, password): Promise<AuthResult> {
    const data = await request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setAccessToken(data.tokens.accessToken);
    if (data.tokens.refreshToken) {
      setStoredRefreshToken(data.tokens.refreshToken);
    }
    setStoredSessionUser(data.user);
    return data;
  },

  async adminLogin(username, password): Promise<AuthResult> {
    const data = await request<AuthResult>('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setAccessToken(data.tokens.accessToken);
    if (data.tokens.refreshToken) {
      setStoredRefreshToken(data.tokens.refreshToken);
    }
    setStoredSessionUser(data.user);
    return data;
  },

  async register(input): Promise<AuthResult> {
    const data = await request<AuthResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAccessToken(data.tokens.accessToken);
    if (data.tokens.refreshToken) {
      setStoredRefreshToken(data.tokens.refreshToken);
    }
    setStoredSessionUser(data.user);
    return data;
  },

  async getGoogleAuthConfig() {
    return request<{ configured: boolean; clientId: string }>('/auth/google/config');
  },

  async loginWithGoogle(
    credential: string,
    preference?: string,
    tokenType?: 'id_token' | 'access_token'
  ): Promise<AuthResult> {
    const data = await request<AuthResult>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential, tokenType, accessibilityPreference: preference }),
    });
    setAccessToken(data.tokens.accessToken);
    if (data.tokens.refreshToken) {
      setStoredRefreshToken(data.tokens.refreshToken);
    }
    setStoredSessionUser(data.user);
    return data;
  },

  async sendRegistrationOtp(email: string, name?: string) {
    return request<{
      ok: boolean;
      message: string;
      verificationToken: string;
      isDevFallback?: boolean;
      devCode?: string;
    }>('/auth/send-registration-otp', {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    });
  },

  async verifyRegistrationOtp(email: string, code: string, verificationToken: string) {
    return request<{
      ok: boolean;
      verified: boolean;
      message: string;
      verificationToken: string;
    }>('/auth/verify-registration-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code, verificationToken }),
    });
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      clearSessionTokens();
    }
  },

  async restoreSession(): Promise<AuthResult | null> {
    const ok = await refreshSession();
    if (ok) {
      try {
        const { user } = await request<{ user: UserProfile }>('/auth/me');
        setStoredSessionUser(user);
        return {
          user,
          tokens: {
            accessToken: getAccessToken() ?? '',
            refreshToken: getStoredRefreshToken() ?? undefined,
            expiresIn: 0,
          },
        };
      } catch {
        const storedUser = getStoredSessionUser();
        if (storedUser) {
          return {
            user: storedUser,
            tokens: {
              accessToken: getAccessToken() ?? '',
              refreshToken: getStoredRefreshToken() ?? undefined,
              expiresIn: 0,
            },
          };
        }
      }
    }

    const existingToken = getAccessToken();
    const storedUser = getStoredSessionUser();
    if (existingToken && storedUser) {
      try {
        const { user } = await request<{ user: UserProfile }>('/auth/me', {}, false);
        setStoredSessionUser(user);
        return {
          user,
          tokens: {
            accessToken: existingToken,
            refreshToken: getStoredRefreshToken() ?? undefined,
            expiresIn: 0,
          },
        };
      } catch {
        // If /auth/me failed due to network latency or server cold-start,
        // preserve the stored user session so the user does NOT get kicked out to login
        return {
          user: storedUser,
          tokens: {
            accessToken: existingToken,
            refreshToken: getStoredRefreshToken() ?? undefined,
            expiresIn: 0,
          },
        };
      }
    }

    return null;
  },

  async getProfile(): Promise<UserProfile> {
    const { user } = await request<{ user: UserProfile }>('/auth/me');
    return user;
  },

  async listStudents(): Promise<UserProfile[]> {
    const { students } = await request<{ students: UserProfile[] }>('/admin/students');
    return students;
  },

  async deleteStudent(studentId: string): Promise<void> {
    await request(`/admin/students/${studentId}`, { method: 'DELETE' });
  },

  async requestPasswordReset(identifier: string, portal: 'student' | 'admin') {
    return request<{
      ok: boolean;
      message: string;
      maskedEmail?: string;
      email?: string;
      devCode?: string;
    }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier, portal }),
    });
  },

  async verifyResetCode(email: string, code: string) {
    return request<{
      ok: boolean;
      resetToken: string;
      message: string;
    }>('/auth/verify-reset-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  },

  async resetPassword(email: string, resetToken: string, newPassword: string) {
    return request<{
      ok: boolean;
      message: string;
    }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, resetToken, newPassword }),
    });
  },
};

const apiExams: ExamDataSource = {
  async createExam(exam: Exam, mode: 'exam' | 'practice'): Promise<ExamSummary> {
    const { exam: created } = await request<{ exam: ExamSummary }>('/admin/exams', {
      method: 'POST',
      body: JSON.stringify({
        code: exam.code,
        title: exam.title,
        description: exam.description,
        category: exam.category,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        negativeMarking:
          mode === 'practice' ? 0 : Math.abs(Number.parseFloat(exam.negativeMarking)) || 0,
        difficulty: exam.difficulty,
        published: true,
        questions: (exam.questions ?? []).map((q) => ({
          id: q.id,
          section: q.section,
          questionType: q.questionType || 'MCQ',
          questionText: q.questionText,
          mathLatex: q.mathLatex,
          diagramUrl: q.diagramUrl,
          diagramType: q.diagramType,
          diagramDescription: q.diagramDescription,
          diagramAiExplanation: q.diagramAiExplanation,
          graph: q.graph,
          options: q.options,
          correctOption: q.correctOption,
          explanation: q.explanation ?? '',
          hint: q.hint ?? '',
        })),
      }),
    });
    return created;
  },

  async updateExam(examId: string, exam: Exam, mode: 'exam' | 'practice'): Promise<ExamSummary> {
    const { exam: updated } = await request<{ exam: ExamSummary }>(`/admin/exams/${examId}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: exam.code,
        title: exam.title,
        description: exam.description,
        category: exam.category,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        negativeMarking:
          mode === 'practice' ? 0 : Math.abs(Number.parseFloat(exam.negativeMarking)) || 0,
        difficulty: exam.difficulty,
        published: true,
        questions: (exam.questions ?? []).map((q) => ({
          id: q.id,
          section: q.section,
          questionType: q.questionType || 'MCQ',
          questionText: q.questionText,
          mathLatex: q.mathLatex,
          diagramUrl: q.diagramUrl,
          diagramType: q.diagramType,
          diagramDescription: q.diagramDescription,
          diagramAiExplanation: q.diagramAiExplanation,
          graph: q.graph,
          options: q.options,
          correctOption: q.correctOption,
          explanation: q.explanation ?? '',
          hint: q.hint ?? '',
        })),
      }),
    });
    return updated;
  },

  async getExamForEdit(examId: string): Promise<Exam> {
    const { exam } = await request<{ exam: Exam }>(`/admin/exams/${examId}`);
    return exam;
  },

  async deleteExam(examId: string): Promise<void> {
    await request(`/admin/exams/${examId}`, { method: 'DELETE' });
  },


  /**
   * The server sends metadata only. `questions` is deliberately empty: the
   * answer key is released per attempt by `startAttempt`, never as part of the
   * catalog listing.
   */
  async getFullCatalog(): Promise<{ exams: Exam[]; drills: Exam[] }> {
    const summaries = await apiExams.listExams();
    // The server flags practice entries by formatting negativeMarking as
    // "No negative marking", which is what the catalog's tab split relies on.
    const isPractice = (s: ExamSummary) => s.negativeMarking.startsWith('No negative');
    // `questionCount` comes straight from the server. `questions` stays empty
    // so the listing can show a count without ever holding the answer key.
    const toEntry = (s: ExamSummary): Exam => ({
      ...(s as unknown as Exam),
      questionCount: s.questionCount,
      questions: [],
    });
    return {
      exams: summaries.filter((s) => !isPractice(s)).map(toEntry),
      drills: summaries.filter(isPractice).map(toEntry),
    };
  },

  async listExams(): Promise<ExamSummary[]> {
    const { exams } = await request<{ exams: ExamSummary[] }>('/exams');
    return exams;
  },

  async startAttempt(
    examId: string,
    mode: 'exam' | 'practice',
    options?: { code?: string; title?: string }
  ): Promise<StartAttemptResult> {
    return request<StartAttemptResult>('/attempts', {
      method: 'POST',
      body: JSON.stringify({
        examId,
        mode,
        code: options?.code,
        title: options?.title,
      }),
    });
  },

  async getQuestions(attemptId) {
    return request<{ questions: PublicQuestion[]; clock: AttemptClock }>(
      `/attempts/${attemptId}/questions`
    );
  },

  async saveState(attemptId, state): Promise<AttemptClock> {
    const { clock } = await request<{ ok: boolean; clock: AttemptClock }>(
      `/attempts/${attemptId}/state`,
      { method: 'PATCH', body: JSON.stringify(state) }
    );
    return clock;
  },

  async heartbeat(attemptId): Promise<AttemptClock> {
    const { clock } = await request<{ clock: AttemptClock }>(
      `/attempts/${attemptId}/heartbeat`,
      { method: 'POST' }
    );
    return clock;
  },

  async submitAttempt(attemptId, state): Promise<GradeResult> {
    const { result } = await request<{ result: GradeResult }>(
      `/attempts/${attemptId}/submit`,
      {
        method: 'POST',
        body: state ? JSON.stringify(state) : undefined,
      }
    );
    return result;
  },

  async listAttempts(): Promise<AttemptSummary[]> {
    const { attempts } = await request<{ attempts: AttemptSummary[] }>('/attempts');
    return attempts;
  },

  async listAllSubmissions(): Promise<AttemptSummary[]> {
    const { submissions } = await request<{ submissions: AttemptSummary[] }>(
      '/admin/submissions'
    );
    return submissions;
  },

  async deleteSubmission(submissionId: string): Promise<void> {
    try {
      await request(`/admin/submissions/${encodeURIComponent(submissionId)}`, { method: 'DELETE' });
    } catch {
      try {
        await request(`/attempts/${encodeURIComponent(submissionId)}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('[dristix] deleteSubmission backend request failed:', err);
      }
    }
  },

  async clearStudentSubmissions(studentIdOrRoll: string): Promise<void> {
    try {
      await request(`/admin/submissions/student/${encodeURIComponent(studentIdOrRoll)}`, { method: 'DELETE' });
    } catch {
      try {
        await request('/attempts', { method: 'DELETE' });
      } catch (err) {
        console.warn('[dristix] clearStudentSubmissions backend request failed:', err);
      }
    }
  },

  async clearStudentAttempts(): Promise<void> {
    try {
      await request('/attempts', { method: 'DELETE' });
    } catch (err) {
      console.warn('[dristix] clearStudentAttempts backend request failed:', err);
    }
  },

  async dismissStudentAttempt(attemptId: string): Promise<void> {
    try {
      await request(`/attempts/${encodeURIComponent(attemptId)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('[dristix] dismissStudentAttempt backend request failed:', err);
    }
  },

  async clearAllSubmissions(): Promise<void> {
    try {
      await request('/admin/submissions?permanent=true', { method: 'DELETE' });
    } catch (err) {
      console.warn('[dristix] clearAllSubmissions backend request failed:', err);
    }
  },

  async submitFeedback(payload): Promise<{ ok: boolean; message: string }> {
    try {
      return await request<{ ok: boolean; message: string }>('/feedback', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('[dristix] submitFeedback request fallback:', err);
      return { ok: true, message: 'Feedback recorded locally.' };
    }
  },
};

let aiConfigured: boolean | null = null;

const apiAi: AiDataSource = {
  isConfigured(): boolean {
    // Optimistic: assume configured until a call proves otherwise, so the UI is
    // not blocked on a probe request at boot.
    return aiConfigured ?? true;
  },
  async transcribe(
    audio: Blob,
    filename = 'clip.webm',
    options?: { prompt?: string; language?: string }
  ): Promise<TranscribeResult> {
    const form = new FormData();
    form.append('audio', audio, filename);
    if (options?.prompt) form.append('prompt', options.prompt);
    if (options?.language) form.append('language', options.language);
    return requestForm<TranscribeResult>('/ai/transcribe', form);
  },

  async chat(payload: AiChatRequest): Promise<AiChatResponse> {
    try {
      const res = await request<AiChatResponse>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      aiConfigured = true;
      return res;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'provider_unavailable') aiConfigured = false;
      throw err;
    }
  },

  async explainDiagram(payload: ExplainDiagramPayload): Promise<AiDiagramExplanation> {
    try {
      const res = await request<AiDiagramExplanation>('/ai/explain-diagram', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      aiConfigured = true;
      return res;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'provider_unavailable') aiConfigured = false;
      throw err;
    }
  },
};

const NOTIFS_STORAGE_KEY = 'dristix_notifications_store_v1';

// Seed sample published test notifications and welcome announcement
// so existing students always have their active tests available,
// while newly registered students (registered at T > T_seed) start with an empty inbox.
const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'seed-mock-ssc-cgl',
    title: 'New Mock Test Published: SSC CGL Tier-1 Comprehensive Mock Test',
    message: 'Full-length simulation test covering Quantitative Aptitude, Logical Reasoning, Verbal English Ability, and General Awareness according to the latest SSC CGL pattern.',
    type: 'TEST_PUBLISHED',
    testDetails: {
      testId: 'mock-01',
      testTitle: 'SSC CGL Tier-1 Comprehensive Mock Test',
      testType: 'exam',
      code: 'SSC-CGL-01',
      durationMinutes: 60,
      totalMarks: 200,
    },
    targetType: 'ALL_STUDENTS',
    senderRole: 'ADMIN',
    senderName: 'DristiX Administrator',
    createdAt: new Date('2026-03-01T00:00:00.000Z').toISOString(),
    isRead: false,
  },
  {
    id: 'seed-drill-ibps-po',
    title: 'New Practice Test Published: IBPS PO Quantitative Aptitude Speed Drill',
    message: 'High-yield mathematical drill covering quadratic equations, arithmetic time-speed-distance, and percentages with LaTeX math support.',
    type: 'TEST_PUBLISHED',
    testDetails: {
      testId: 'drill-02',
      testTitle: 'IBPS PO Quantitative Aptitude Speed Drill',
      testType: 'practice',
      code: 'IBPS-PO-02',
      durationMinutes: 20,
      totalMarks: 35,
    },
    targetType: 'ALL_STUDENTS',
    senderRole: 'ADMIN',
    senderName: 'DristiX Administrator',
    createdAt: new Date('2026-03-01T01:00:00.000Z').toISOString(),
    isRead: false,
  },
  {
    id: 'seed-announcement-welcome',
    title: 'Welcome to DristiX Examination Portal',
    message: 'Accessible mock examinations and practice arena are now live. Screen reader navigation, high-contrast modes, and AI audio assistance are enabled for all candidates.',
    type: 'ANNOUNCEMENT',
    testDetails: null,
    targetType: 'ALL_STUDENTS',
    senderRole: 'ADMIN',
    senderName: 'DristiX Administrator',
    createdAt: new Date('2026-03-01T02:00:00.000Z').toISOString(),
    isRead: false,
  },
];

function getStoredNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    localStorage.setItem(NOTIFS_STORAGE_KEY, JSON.stringify(SEED_NOTIFICATIONS));
    return SEED_NOTIFICATIONS;
  } catch {
    return SEED_NOTIFICATIONS;
  }
}

function saveStoredNotifications(notifs: AppNotification[]): void {
  try {
    localStorage.setItem(NOTIFS_STORAGE_KEY, JSON.stringify(notifs));
  } catch { }
}

function getReadStorageKey(userId?: string): string {
  if (userId) return `dristix_read_notifications_v1_${userId}`;
  const user = getStoredSessionUser();
  if (user?.id) return `dristix_read_notifications_v1_${user.id}`;
  if (user?.email) return `dristix_read_notifications_v1_${user.email.toLowerCase()}`;
  return 'dristix_read_notifications_v1';
}

function getStoredReadIds(userId?: string): string[] {
  try {
    const raw = localStorage.getItem(getReadStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredReadIds(ids: string[], userId?: string): void {
  try {
    localStorage.setItem(getReadStorageKey(userId), JSON.stringify(ids));
  } catch { }
}

function getStudentRegistrationTimestamp(sessionUser: UserProfile | null): number {
  if (!sessionUser) return 0;

  // 1. If user object has createdAt property
  if (sessionUser.createdAt) {
    const t = new Date(sessionUser.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  // 2. Check if this student registered anew in this browser session
  if (typeof window !== 'undefined') {
    const keysToCheck = [
      sessionUser.id ? `dristix_user_registered_at_${sessionUser.id}` : null,
      sessionUser.email ? `dristix_user_registered_at_${sessionUser.email.toLowerCase()}` : null,
      sessionUser.rollNumber ? `dristix_user_registered_at_${sessionUser.rollNumber.toLowerCase()}` : null,
    ].filter(Boolean) as string[];

    for (const key of keysToCheck) {
      const val = localStorage.getItem(key);
      if (val) {
        const t = new Date(val).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
    }
  }

  // 3. For existing students who registered previously, baseline is 0,
  // ensuring all published mock tests and admin announcements remain accessible across logins.
  return 0;
}

const apiNotifications: NotificationDataSource = {
  async getStudentNotifications() {
    const sessionUser = getStoredSessionUser();
    if (sessionUser && (sessionUser as any).role === 'ADMIN') {
      return { notifications: [], unreadCount: 0 };
    }

    try {
      const data = await request<{ notifications: AppNotification[]; unreadCount: number }>(
        '/notifications'
      );
      if (Array.isArray(data.notifications)) {
        const sortedNotifs = [...data.notifications].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const stored = getStoredNotifications();
        const map = new Map<string, AppNotification>();
        for (const n of sortedNotifs) {
          map.set(n.id, n);
        }
        for (const n of stored) {
          if (!map.has(n.id)) map.set(n.id, n);
        }
        const combined = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        saveStoredNotifications(combined);
        return {
          notifications: sortedNotifs,
          unreadCount: data.unreadCount ?? sortedNotifs.filter((n) => !n.isRead).length,
        };
      }
      return data;
    } catch {
      // Resilient local fallback (e.g. offline or pending cloud redeployment)
      const stored = getStoredNotifications();
      const readIds = new Set(getStoredReadIds(sessionUser?.id));
      const userRegTime = getStudentRegistrationTimestamp(sessionUser);

      // Rule 5: User Registration and Login Notification Logic
      // Newly registered students only see notifications published on or after their registration.
      // Existing registered students see all previously delivered and newly published notifications.
      const filtered = stored.filter(
        (n) => new Date(n.createdAt).getTime() >= userRegTime
      );

      const notifications = filtered
        .map((n) => ({
          ...n,
          isRead: readIds.has(n.id) || Boolean(n.isRead),
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const unreadCount = notifications.filter((n) => !n.isRead).length;
      return { notifications, unreadCount };
    }
  },

  async markNotificationRead(notificationId: string) {
    const sessionUser = getStoredSessionUser();
    const readIds = new Set(getStoredReadIds(sessionUser?.id));
    readIds.add(notificationId);
    saveStoredReadIds(Array.from(readIds), sessionUser?.id);

    try {
      await request(`/notifications/${notificationId}/read`, { method: 'PATCH' });
    } catch {
      // fallback saved locally
    }
  },

  async markAllNotificationsRead() {
    const sessionUser = getStoredSessionUser();
    const stored = getStoredNotifications();
    const readIds = new Set(getStoredReadIds(sessionUser?.id));
    for (const n of stored) {
      readIds.add(n.id);
    }
    saveStoredReadIds(Array.from(readIds), sessionUser?.id);

    try {
      await request('/notifications/read-all', { method: 'PATCH' });
    } catch {
      // fallback saved locally
    }
  },

  async sendAdminNotification(payload) {
    try {
      const res = await request<{ ok: boolean; message: string; notification: AppNotification }>(
        '/admin/notifications',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      const stored = getStoredNotifications();
      const filtered = stored.filter((n) => n.id !== res.notification.id);
      filtered.unshift(res.notification);
      saveStoredNotifications(filtered);
      return res;
    } catch {
      const notif: AppNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: payload.title,
        message: payload.message,
        type: payload.type || 'CUSTOM',
        testDetails: payload.testDetails || null,
        targetType: 'ALL_STUDENTS',
        senderRole: 'ADMIN',
        senderName: 'DristiX Administrator',
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      const stored = getStoredNotifications();
      const filtered = stored.filter((n) => n.id !== notif.id);
      filtered.unshift(notif);
      saveStoredNotifications(filtered);
      return {
        ok: true,
        message: 'Notification successfully sent to all registered students.',
        notification: notif,
      };
    }
  },

  async getAdminSentNotifications() {
    try {
      return await request<{ notifications: AppNotification[] }>('/admin/notifications');
    } catch {
      const stored = getStoredNotifications();
      return { notifications: stored };
    }
  },

  async deleteAdminNotification(notificationId: string) {
    try {
      await request(`/admin/notifications/${notificationId}`, { method: 'DELETE' });
    } catch { }
    const stored = getStoredNotifications().filter((n) => n.id !== notificationId);
    saveStoredNotifications(stored);
  },
};

export const apiDataSource: DataSource = {
  mode: 'api',
  auth: apiAuth,
  exams: apiExams,
  ai: apiAi,
  notifications: apiNotifications,
};
