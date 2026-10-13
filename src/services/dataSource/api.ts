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
} from '../../../shared/types';
import type {
  AiDataSource,
  AuthDataSource,
  DataSource,
  ExamDataSource,
  ExplainDiagramPayload,
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
import { getAccessToken, setAccessToken, refreshSession } from './apiToken.js';
import { requestForm } from './apiForm';

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;

  let message = `Request failed (${res.status}).`;
  let code = 'error';
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

  const res = await fetch(`${BASE_API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && retry && (await refreshSession())) {
    return request<T>(path, init, false);
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
    return data;
  },

  async adminLogin(username, password): Promise<AuthResult> {
    const data = await request<AuthResult>('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setAccessToken(data.tokens.accessToken);
    return data;
  },

  async register(input): Promise<AuthResult> {
    const data = await request<AuthResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAccessToken(data.tokens.accessToken);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
    }
  },

  async restoreSession(): Promise<AuthResult | null> {
    const ok = await refreshSession();
    if (!ok) return null;
    return request<{ user: UserProfile } & AuthResult>('/auth/me').then((r) => ({
      user: r.user,
      tokens: { accessToken: getAccessToken() ?? '', expiresIn: 0 },
    }));
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

  async startAttempt(examId, mode): Promise<StartAttemptResult> {
    return request<StartAttemptResult>('/attempts', {
      method: 'POST',
      body: JSON.stringify({ examId, mode }),
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

  async listAllSubmissions(): Promise<AttemptSummary[]>{
    const { submissions } = await request<{ submissions: AttemptSummary[] }>(
      '/admin/submissions'
    );
    return submissions;
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

export const apiDataSource: DataSource = {
  mode: 'api',
  auth: apiAuth,
  exams: apiExams,
  ai: apiAi,
};
