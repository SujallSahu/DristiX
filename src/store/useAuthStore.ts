import { create } from 'zustand';
import { soundEffects } from '../utils/soundEffects';
import { useAnnouncerStore } from './useAnnouncerStore';
import { useBootstrapStore } from '../stores/useBootstrapStore';
import { getDataSource } from '../services/dataSource';
import { onSessionExpired } from '../services/dataSource/apiToken';
import type {
  AccessibilityPreference,
  AttemptSummary,
  UserProfile,
} from '../../shared/types';

export const authBroadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('dristix_auth_sync')
    : null;

if (authBroadcastChannel) {
  authBroadcastChannel.onmessage = (event) => {
    const data = event.data;
    if (data === 'LOGIN') {
      void useBootstrapStore.getState().run();
    } else if (data === 'LOGOUT') {
      useAuthStore.getState().setSession(null);
    } else if (
      data === 'SUBMISSION' ||
      data?.type === 'SUBMISSION_UPDATED' ||
      data?.type === 'SUBMISSION_DELETED'
    ) {
      void useAuthStore.getState().syncSubmissions();
      if (useAuthStore.getState().isAdminAuthenticated) {
        void useAuthStore.getState().fetchStudents();
      }
    } else if (data === 'CATALOG_UPDATED' || data?.type === 'CATALOG_UPDATED') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dristix:catalog-updated', { detail: data }));
      }
    } else if (data?.type === 'STUDENT_DELETED') {
      const currentStudent = useAuthStore.getState().currentStudent;
      if (
        currentStudent &&
        (currentStudent.id === data.studentId || currentStudent.rollNumber === data.rollNumber)
      ) {
        useAuthStore.getState().setSession(null);
        useAnnouncerStore
          .getState()
          .announce('Your student account has been removed by the administrator.', 'assertive', true);
      } else {
        void useAuthStore.getState().fetchStudents();
      }
    } else if (data === 'STUDENT_REGISTERED' || data?.type === 'STUDENT_REGISTERED') {
      if (useAuthStore.getState().isAdminAuthenticated) {
        void useAuthStore.getState().fetchStudents();
      }
    }
  };
}

/**
 * Maps a server AttemptSummary onto the local ExamSubmission shape so every
 * existing consumer — student analytics, admin panel, the voice assistant's
 * context builder — keeps working without knowing which data source it reads.
 */
function toSubmission(
  a: AttemptSummary & { studentId?: string },
  student?: { id?: string; name?: string; rollNumber?: string }
): ExamSubmission {
  const resolvedRoll = a.student?.rollNumber || student?.rollNumber || '';
  const resolvedId = (a.student as any)?.id || a.studentId || student?.id || resolvedRoll;
  const resolvedName = a.student?.name || student?.name || 'Student Candidate';
  const submittedTime = a.submittedAt
    ? new Date(a.submittedAt).getTime()
    : (a.startedAt ? new Date(a.startedAt).getTime() : Date.now());

  return {
    id: a.id,
    examId: a.examId,
    examTitle: a.examTitle,
    examCode: a.examCode,
    examType: a.mode,
    studentId: resolvedId,
    studentName: resolvedName,
    studentRoll: resolvedRoll,
    score: a.score ?? 0,
    maxScore: a.maxScore ?? 0,
    percentage: a.percentage ?? 0,
    correctCount: a.correctCount ?? 0,
    incorrectCount: a.incorrectCount ?? 0,
    unattemptedCount: a.unattemptedCount ?? 0,
    submittedAt: submittedTime,
  };
}

/**
 * The UI-facing student shape. It is the shared `UserProfile` plus the
 * `registeredAt` timestamp the roster views display, made optional because the
 * server only sends it on the admin roster endpoint — a signed-in student's
 * profile does not carry it.
 */
export interface StudentProfile extends Omit<UserProfile, 'accessibilityPreference'> {
  accessibilityPreference: AccessibilityPreference | null;
  registeredAt?: number;
}

export interface ExamSubmission {
  id: string;
  examId: string;
  examTitle: string;
  examCode: string;
  examType: 'exam' | 'practice';
  studentId: string;
  studentName: string;
  studentRoll: string;
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  submittedAt: number;
}


interface AuthState {
  currentStudent: StudentProfile | null;
  students: StudentProfile[];
  submissions: ExamSubmission[];
  isAdminAuthenticated: boolean;

  /**
   * Applies the session resolved during bootstrap. The server is the only
   * authority on who is signed in; nothing is cached in localStorage.
   */
  setSession: (user: StudentProfile | null) => void;

  // Student Actions — all async: the server decides.
  loginStudent: (identifier: string, pass: string) => Promise<boolean>;
  registerStudent: (
    name: string,
    email: string,
    roll: string,
    preference: StudentProfile['accessibilityPreference'],
    pass: string,
    verificationToken?: string
  ) => Promise<boolean>;
  loginWithGoogle: (credential: string, preference?: string) => Promise<boolean>;
  sendRegistrationOtp: (
    email: string,
    name?: string
  ) => Promise<{
    ok: boolean;
    message: string;
    verificationToken: string;
    isDevFallback?: boolean;
    devCode?: string;
  }>;
  verifyRegistrationOtp: (
    email: string,
    code: string,
    verificationToken: string
  ) => Promise<{
    ok: boolean;
    verified: boolean;
    message: string;
    verificationToken: string;
  }>;
  logoutStudent: () => Promise<void>;

  // Admin Actions
  loginAdmin: (username: string, pass: string) => Promise<boolean>;
  logoutAdmin: () => void;
  fetchStudents: () => Promise<void>;
  deleteStudent: (studentId: string) => Promise<boolean>;

  // Password Reset Actions
  requestPasswordReset: (
    identifier: string,
    portal: 'student' | 'admin'
  ) => Promise<{
    ok: boolean;
    success?: boolean;
    message: string;
    maskedEmail?: string;
    email?: string;
    devCode?: string;
  }>;
  verifyResetCode: (
    email: string,
    code: string
  ) => Promise<{
    ok: boolean;
    success?: boolean;
    resetToken: string;
    message: string;
  }>;
  resetPassword: (
    email: string,
    resetToken: string,
    newPassword: string
  ) => Promise<{
    ok: boolean;
    success?: boolean;
    message: string;
  }>;

  // Submissions Actions
  /**
   * Reloads the submission history from the active data source.
   *
   * In api mode the Attempt documents on the server ARE the submissions, so
   * this replaces whatever the store had. Admins get every student's results;
   * a student gets only their own. In offline mode it is a no-op because the
   * history already lives in localStorage.
   */
  syncSubmissions: () => Promise<void>;
  addSubmission: (
    sub: Omit<ExamSubmission, 'id' | 'submittedAt' | 'studentId' | 'studentName' | 'studentRoll'> & {
      id?: string;
      submittedAt?: number;
    }
  ) => void;
  deleteSubmission: (submissionId: string) => Promise<boolean>;
  clearAllSubmissions: () => Promise<boolean>;
  clearStudentHistory: () => void;
  dismissStudentSubmission: (submissionId: string) => void;
}

/**
 * Submissions are a server-side projection of the Attempt documents, but the
 * admin panel can still delete one locally, so the trimmed list is cached to
 * avoid refetching on every render. It is a cache, never a source of truth.
 */
const SUBMISSIONS_CACHE = 'dristix_submissions_cache';
const ADMIN_DELETED_SUBMISSIONS_KEY = 'dristix_admin_deleted_submissions';

// Purge legacy tombstone storage keys that could inadvertently mask valid backend submissions
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('dristix_deleted_submissions');
    localStorage.removeItem('dristix_admin_deleted_submissions');
  } catch {}
}

export function getAdminDeletedSubmissionIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(ADMIN_DELETED_SUBMISSIONS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function addAdminDeletedSubmissionId(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  try {
    const current = getAdminDeletedSubmissionIds();
    current.add(id);
    localStorage.setItem(ADMIN_DELETED_SUBMISSIONS_KEY, JSON.stringify([...current]));
  } catch {
    // Ignore quota errors
  }
}

export function addAdminDeletedSubmissionIds(ids: string[]): void {
  if (typeof window === 'undefined' || !ids.length) return;
  try {
    const current = getAdminDeletedSubmissionIds();
    ids.forEach((id) => current.add(id));
    localStorage.setItem(ADMIN_DELETED_SUBMISSIONS_KEY, JSON.stringify([...current]));
  } catch {
    // Ignore quota errors
  }
}

export function getStudentClearedTimestamp(studentKey: string): number | null {
  if (typeof window === 'undefined' || !studentKey) return null;
  try {
    const raw = localStorage.getItem(`dristix_student_cleared_${studentKey.trim().toLowerCase()}`);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function setStudentClearedTimestamp(studentKey: string, timestamp: number): void {
  if (typeof window === 'undefined' || !studentKey) return;
  try {
    localStorage.setItem(`dristix_student_cleared_${studentKey.trim().toLowerCase()}`, String(timestamp));
  } catch {}
}

export function getStudentDismissedIds(studentKey: string): Set<string> {
  if (typeof window === 'undefined' || !studentKey) return new Set();
  try {
    const raw = localStorage.getItem(`dristix_student_dismissed_${studentKey.trim().toLowerCase()}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function addStudentDismissedId(studentKey: string, id: string): void {
  if (typeof window === 'undefined' || !studentKey || !id) return;
  try {
    const set = getStudentDismissedIds(studentKey);
    set.add(id);
    localStorage.setItem(`dristix_student_dismissed_${studentKey.trim().toLowerCase()}`, JSON.stringify([...set]));
  } catch {}
}

/**
 * Deduplicates submissions ensuring only ONE entry remains per test attempt.
 * Resolves race conditions between provisional client-side submissions and backend
 * MongoDB submissions so the student analytics, admin views, and announcements
 * never show duplicate entries.
 */
export function deduplicateSubmissions(subs: ExamSubmission[]): ExamSubmission[] {
  if (!subs || subs.length <= 1) return subs || [];

  const seenIds = new Set<string>();
  const seenAttempts: Array<{
    id: string;
    examId: string;
    studentKey: string;
    submittedAt: number;
    score: number;
    isRealServerId: boolean;
  }> = [];

  const result: ExamSubmission[] = [];

  // Sort: real server IDs first (not starting with 'sub-'), then newest submittedAt
  const sorted = [...subs].sort((a, b) => {
    const aIsServer = a.id && !a.id.startsWith('sub-');
    const bIsServer = b.id && !b.id.startsWith('sub-');
    if (aIsServer !== bIsServer) {
      return aIsServer ? -1 : 1;
    }
    return (b.submittedAt || 0) - (a.submittedAt || 0);
  });

  for (const s of sorted) {
    if (!s || !s.id) continue;
    if (seenIds.has(s.id)) continue;

    const studentKey = (s.studentRoll || s.studentId || s.studentName || '').trim().toLowerCase();
    const isRealServer = !s.id.startsWith('sub-');

    // Check if this test attempt was already accounted for
    const isDuplicate = seenAttempts.some((seen) => {
      const matchStudent = !studentKey || !seen.studentKey || studentKey === seen.studentKey;
      const matchExam = seen.examId === s.examId || (s.examCode && seen.id === s.examCode);
      const matchTime = Math.abs(seen.submittedAt - s.submittedAt) < 180000; // 3 minutes window
      return matchStudent && matchExam && matchTime;
    });

    if (isDuplicate) {
      continue;
    }

    seenIds.add(s.id);
    seenAttempts.push({
      id: s.id,
      examId: s.examId,
      studentKey,
      submittedAt: s.submittedAt || 0,
      score: s.score || 0,
      isRealServerId: isRealServer,
    });
    result.push(s);
  }

  // Preserve descending chronological order
  return result.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
}

const saveStored = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors
  }
};

export const useAuthStore = create<AuthState>((set, get) => {
  // Nothing is read from localStorage any more.
  //
  // The session is owned by the server: an httpOnly refresh cookie plus a
  // short-lived access token held in memory. A previous version cached
  // `currentStudent` in localStorage and read it at module scope, which meant a
  // browser left over from offline mode rendered the full portal while every
  // API call 401'd — the app looked signed in but was not.
  const initialAdminAuth = sessionStorage.getItem('dristix_admin_auth') === 'true';

  return {
    currentStudent: null,
    students: [],
    submissions: [],
    isAdminAuthenticated: initialAdminAuth,

    /**
     * Applies a session resolved by the bootstrap flow, or clears it on sign
     * out. This is the only way `currentStudent` is set from outside.
     */
    setSession: (user: StudentProfile | null) => set({ currentStudent: user }),

    loginStudent: async (identifier: string, pass: string) => {
      try {
        const { user } = await getDataSource().auth.login(identifier, pass);
        set({ currentStudent: user, isAdminAuthenticated: false });
        sessionStorage.removeItem('dristix_admin_auth');
        authBroadcastChannel?.postMessage('LOGIN');
        soundEffects.playSuccess();
        useAnnouncerStore
          .getState()
          .announce(
            `Welcome ${user.name}. Logged in successfully with Roll Number ${user.rollNumber}.`,
            'assertive',
            true
          );
        return true;
      } catch {
        soundEffects.playSelect();
        useAnnouncerStore
          .getState()
          .announce('Invalid student credentials. Please check your Roll Number, Email and password.', 'assertive', true);
        return false;
      }
    },

    registerStudent: async (name, email, roll, preference, pass, verificationToken) => {
      try {
        const { user } = await getDataSource().auth.register({
          name,
          email,
          rollNumber: roll,
          password: pass,
          accessibilityPreference: preference ?? undefined,
          verificationToken,
        });
        set({ currentStudent: user, isAdminAuthenticated: false });
        sessionStorage.removeItem('dristix_admin_auth');
        authBroadcastChannel?.postMessage('LOGIN');
        // Keep the roster fresh so admin views and the demo list stay accurate.
        void getDataSource().auth
          .listStudents()
          .then((students) => set({ students }))
          .catch(() => undefined);

        soundEffects.playSuccess();
        useAnnouncerStore
          .getState()
          .announce(`Registration successful! Welcome to DristiX, ${user.name}.`, 'assertive', true);
        return true;
      } catch (err: any) {
        useAnnouncerStore
          .getState()
          .announce(
            err?.message || 'Registration failed. That Email or Roll Number may already be registered.',
            'assertive',
            true
          );
        return false;
      }
    },

    loginWithGoogle: async (credential: string, preference?: string) => {
      try {
        const { user } = await getDataSource().auth.loginWithGoogle(credential, preference);
        set({ currentStudent: user, isAdminAuthenticated: false });
        sessionStorage.removeItem('dristix_admin_auth');
        authBroadcastChannel?.postMessage('LOGIN');
        soundEffects.playSuccess();
        useAnnouncerStore
          .getState()
          .announce(`Welcome ${user.name}. Google authentication successful!`, 'assertive', true);
        return true;
      } catch (err: any) {
        soundEffects.playSelect();
        useAnnouncerStore
          .getState()
          .announce(err?.message || 'Google authentication failed. Please try again.', 'assertive', true);
        return false;
      }
    },

    sendRegistrationOtp: async (email: string, name?: string) => {
      return getDataSource().auth.sendRegistrationOtp(email, name);
    },

    verifyRegistrationOtp: async (email: string, code: string, verificationToken: string) => {
      return getDataSource().auth.verifyRegistrationOtp(email, code, verificationToken);
    },

    logoutStudent: async () => {
      try {
        await getDataSource().auth.logout();
      } catch {
        // Clearing local state matters more than the server round trip.
      }
      set({ currentStudent: null, submissions: [], students: [] });
      authBroadcastChannel?.postMessage('LOGOUT');
      soundEffects.playNavigate();
      useAnnouncerStore.getState().announce('Signed out of student account.', 'polite', true);
    },

    loginAdmin: async (username: string, pass: string) => {
      try {
        await getDataSource().auth.adminLogin(username, pass);
        set({ isAdminAuthenticated: true, currentStudent: null });
        sessionStorage.setItem('dristix_admin_auth', 'true');
        // Authoritative sync: immediately fetch full cohort submissions and roster for Admin Studio
        void get().syncSubmissions();
        void get().fetchStudents();
        soundEffects.playSuccess();
        useAnnouncerStore
          .getState()
          .announce('Admin authentication successful. Welcome to DristiX Admin Studio.', 'assertive', true);
        return true;
      } catch {
        useAnnouncerStore
          .getState()
          .announce('Authentication failed. Invalid administrator username or password.', 'assertive', true);
        return false;
      }
    },

    logoutAdmin: () => {
      set({ isAdminAuthenticated: false, submissions: [] });
      sessionStorage.removeItem('dristix_admin_auth');
      soundEffects.playNavigate();
      useAnnouncerStore.getState().announce('Logged out of Admin Studio.', 'polite', true);
    },

    fetchStudents: async () => {
      try {
        const students = await getDataSource().auth.listStudents();
        set({ students });
      } catch (err) {
        console.error('[dristix] fetchStudents error', err);
      }
    },

    deleteStudent: async (studentId: string) => {
      try {
        const student = get().students.find((s) => s.id === studentId);
        await getDataSource().auth.deleteStudent(studentId);

        // Also clean up submissions belonging to that student
        const targetRoll = student?.rollNumber ? student.rollNumber.trim().toLowerCase() : '';
        const targetId = studentId.trim().toLowerCase();
        const removedIds: string[] = [];
        const updatedSubs = get().submissions.filter((sub) => {
          const sRoll = sub.studentRoll ? sub.studentRoll.trim().toLowerCase() : '';
          const sId = sub.studentId ? String(sub.studentId).trim().toLowerCase() : '';
          if (sId === targetId || (targetRoll && sRoll === targetRoll)) {
            removedIds.push(sub.id);
            return false;
          }
          return true;
        });

        addAdminDeletedSubmissionIds(removedIds);
        set((state) => ({
          students: state.students.filter((s) => s.id !== studentId),
          submissions: updatedSubs,
        }));
        saveStored(SUBMISSIONS_CACHE, updatedSubs);

        // Broadcast across tabs
        try {
          authBroadcastChannel?.postMessage({
            type: 'STUDENT_DELETED',
            studentId,
            rollNumber: student?.rollNumber,
            timestamp: Date.now(),
          });
          authBroadcastChannel?.postMessage({ type: 'SUBMISSION_DELETED', timestamp: Date.now() });
        } catch {}
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dristix:submission-updated'));
        }

        soundEffects.playSuccess();
        useAnnouncerStore.getState().announce('Student account successfully removed.', 'assertive', true);
        return true;
      } catch (err) {
        console.error('[dristix] deleteStudent error', err);
        useAnnouncerStore.getState().announce('Could not delete student account.', 'assertive', true);
        return false;
      }
    },

    requestPasswordReset: async (identifier: string, portal: 'student' | 'admin' = 'student') => {
      return getDataSource().auth.requestPasswordReset(identifier, portal);
    },

    verifyResetCode: async (email: string, code: string) => {
      return getDataSource().auth.verifyResetCode(email, code);
    },

    resetPassword: async (email: string, resetToken: string, newPassword: string) => {
      const res = await getDataSource().auth.resetPassword(email, resetToken, newPassword);
      if (res.ok || res.success) {
        soundEffects.playSuccess();
      }
      return res;
    },

    syncSubmissions: async () => {
      // Single data source: always refresh from the backend.
      try {
        const source = getDataSource();
        const isAdmin = get().isAdminAuthenticated;
        // Admins see the whole cohort; a student only their own attempts.
        const rows = isAdmin
          ? (await source.exams.listAllSubmissions()).map((a) => toSubmission(a, a.student))
          : (await source.exams.listAttempts()).map((a) => {
              const me = get().currentStudent;
              return toSubmission(a, me ? { id: me.id, name: me.name, rollNumber: me.rollNumber } : undefined);
            });

        // For admin portal: filter out any explicitly deleted IDs
        const adminDeletedIds = getAdminDeletedSubmissionIds();
        const validRows = isAdmin
          ? rows.filter((r) => !adminDeletedIds.has(r.id))
          : rows.filter((r) => r.submittedAt > 0);

        // Preserve any recent local-only / in-progress submissions (id starting with 'sub-')
        // only if they have not already been persisted to the server.
        const currentSubs = get().submissions;
        const serverIds = new Set(validRows.map((r) => r.id));
        const localOnly = currentSubs.filter((s) => {
          if (!s.id.startsWith('sub-')) return false;
          if (serverIds.has(s.id)) return false;
          // Discard provisional sub- if a matching server attempt exists
          const matchedOnServer = validRows.some(
            (vr) =>
              (vr.examId === s.examId || (s.examCode && vr.examCode === s.examCode)) &&
              Math.abs(vr.submittedAt - s.submittedAt) < 300000
          );
          return !matchedOnServer;
        });

        const mergedRows = deduplicateSubmissions([...validRows, ...localOnly]);

        set({ submissions: mergedRows });
        saveStored(SUBMISSIONS_CACHE, mergedRows);
      } catch (err) {
        // Keep whatever we already have; a failed refresh is not worth a disruptive empty state.
        console.warn('[dristix] syncSubmissions background sync failed:', err);
      }
    },

    addSubmission: (sub) => {
      const student = get().currentStudent || {
        id: 'std-guest',
        name: 'Guest Candidate',
        rollNumber: 'DX-GUEST',
      };

      const resolvedId = sub.id || `sub-${Date.now().toString().slice(-6)}`;
      const newSub: ExamSubmission = {
        ...sub,
        id: resolvedId,
        studentId: student.id,
        studentName: student.name,
        studentRoll: student.rollNumber,
        submittedAt: sub.submittedAt || Date.now(),
      };

      const existing = get().submissions.filter((s) => s.id !== newSub.id);
      const updated = deduplicateSubmissions([newSub, ...existing]);
      set({ submissions: updated });
      saveStored(SUBMISSIONS_CACHE, updated);

      // Notify cross-tab and active components in real time
      try {
        authBroadcastChannel?.postMessage({
          type: 'SUBMISSION_UPDATED',
          submission: newSub,
          timestamp: Date.now(),
        });
      } catch {
        // BroadcastChannel unavailable
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('dristix:submission-updated', { detail: newSub })
        );
      }
    },

    deleteSubmission: async (submissionId: string) => {
      addAdminDeletedSubmissionId(submissionId);
      const updated = get().submissions.filter((s) => s.id !== submissionId);
      set({ submissions: updated });
      saveStored(SUBMISSIONS_CACHE, updated);

      // Best effort backend deletion for admin
      try {
        await (getDataSource().exams as any).deleteSubmission?.(submissionId);
      } catch {
        // Fallback gracefully
      }

      // Notify other tabs and components in real time
      try {
        authBroadcastChannel?.postMessage({
          type: 'SUBMISSION_DELETED',
          submissionId,
          timestamp: Date.now(),
        });
      } catch {
        // BroadcastChannel unavailable
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('dristix:submission-deleted', { detail: { submissionId } })
        );
      }

      soundEffects.playSelect();
      useAnnouncerStore.getState().announce('Test submission record deleted by administrator.', 'polite', true);
      return true;
    },

    /**
     * Resets the candidate-facing test history in the Student Portal only.
     * Does NOT delete or alter actual test attempts in the admin portal or database,
     * ensuring administrators retain complete candidate records and analytics.
     */
    clearStudentHistory: () => {
      const student = get().currentStudent;
      if (!student) return;
      const key = (student.rollNumber || student.id || '').trim().toLowerCase();
      const now = Date.now();
      setStudentClearedTimestamp(key, now);

      // Inform server to mark student attempts clearedByStudent: true
      void (getDataSource().exams as any).clearStudentAttempts?.();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('dristix:student-history-cleared', { detail: { studentKey: key, clearedAt: now } })
        );
      }

      soundEffects.playSelect();
      useAnnouncerStore
        .getState()
        .announce('Your test history has been cleared from your student view. Your actual test submissions remain securely recorded for administrative evaluation.', 'assertive', true);
    },

    /**
     * Removes an individual test attempt from the student's personal view only,
     * leaving administrative records and database intact.
     */
    dismissStudentSubmission: (submissionId: string) => {
      const student = get().currentStudent;
      if (!student) return;
      const key = (student.rollNumber || student.id || '').trim().toLowerCase();
      addStudentDismissedId(key, submissionId);

      // Inform server to mark attempt clearedByStudent: true
      void (getDataSource().exams as any).dismissStudentAttempt?.(submissionId);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('dristix:student-history-cleared', { detail: { studentKey: key, submissionId } })
        );
      }

      soundEffects.playSelect();
      useAnnouncerStore
        .getState()
        .announce('Test attempt removed from your student view.', 'polite', true);
    },

    /**
     * Purges all submission records across the cohort from the Admin Portal (admin only).
     * Marks MongoDB attempts clearedByAdmin: true so student-side history is completely unaffected!
     */
    clearAllSubmissions: async () => {
      if (!get().isAdminAuthenticated) return false;

      try {
        await (getDataSource().exams as any).clearAllSubmissions?.();
      } catch (err) {
        console.warn('[dristix] clearAllSubmissions error:', err);
      }

      set({ submissions: [] });
      saveStored(SUBMISSIONS_CACHE, []);
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(ADMIN_DELETED_SUBMISSIONS_KEY);
        } catch {}
      }

      // Notify cross-tab and active components in real time
      try {
        authBroadcastChannel?.postMessage({
          type: 'SUBMISSION_CLEARED_ALL',
          timestamp: Date.now(),
        });
      } catch {
        // BroadcastChannel unavailable
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('dristix:submission-cleared', { detail: { timestamp: Date.now() } })
        );
      }

      soundEffects.playSelect();
      useAnnouncerStore
        .getState()
        .announce('All examination submissions have been cleared from Admin Portal.', 'assertive', true);
      return true;
    },
  };
});

// Automatically reset student session when API token refresh fails/expires
onSessionExpired(() => {
  if (useAuthStore.getState().currentStudent) {
    useAuthStore.getState().setSession(null);
    useAnnouncerStore.getState().announce('Your session has expired. Please sign in again.', 'assertive', true);
  }
});
