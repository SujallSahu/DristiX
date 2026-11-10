import { Attempt, type AttemptDoc, type ExamDoc } from '../models/index.js';
import type { AttemptClock, AttemptSummary, ExamSummary } from '../../../shared/types.js';

/** Maps an Exam document to the safe catalog shape (no questions attached). */
export function toExamSummary(exam: ExamDoc): ExamSummary {
  return {
    id: String(exam._id),
    code: exam.code,
    title: exam.title,
    description: exam.description,
    category: exam.category,
    durationMinutes: exam.durationMinutes,
    totalMarks: exam.totalMarks,
    negativeMarking:
      exam.negativeMarking > 0
        ? `-${exam.negativeMarking} marks per incorrect response`
        : 'No negative marking (Practice)',
    difficulty: exam.difficulty,
    sections: [...new Set((exam.questions ?? []).map((q) => q.section))],
    questionCount: exam.questions?.length ?? 0,
  };
}

export function toAttemptSummary(
  attempt: AttemptDoc,
  exam?: { title?: string; code?: string } | null
): AttemptSummary {
  return {
    id: String(attempt._id),
    studentId: String(attempt.studentId),
    examId: String(attempt.examId),
    examTitle: exam?.title ?? '',
    examCode: exam?.code ?? '',
    mode: attempt.mode as AttemptSummary['mode'],
    status: attempt.status as AttemptSummary['status'],
    startedAt: new Date(attempt.startedAt).toISOString(),
    expiresAt: new Date(attempt.expiresAt).toISOString(),
    submittedAt: attempt.submittedAt ? new Date(attempt.submittedAt).toISOString() : null,
    // Mongoose types schema defaults as optional, so a never-scored attempt
    // arrives as undefined. Normalise to null to match the wire contract.
    score: attempt.score ?? null,
    maxScore: attempt.maxScore ?? null,
    percentage: attempt.percentage ?? null,
    correctCount: attempt.correctCount ?? null,
    incorrectCount: attempt.incorrectCount ?? null,
    unattemptedCount: attempt.unattemptedCount ?? null,
    timeTakenSeconds:
      (attempt as any).timeTakenSeconds ??
      (attempt.submittedAt
        ? Math.max(0, Math.round((new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000))
        : null),
  };
}

/**
 * The server owns the clock. The client never decides how much time is left â€”
 * it renders `remainingSeconds` and re-syncs on every heartbeat, so editing
 * client state cannot extend an exam and closing the tab does not reset it.
 */
export function buildClock(attempt: AttemptDoc, serverNow = new Date()): AttemptClock {
  const expiresAt = new Date(attempt.expiresAt);
  return {
    attemptId: String(attempt._id),
    serverNow: serverNow.toISOString(),
    expiresAt: expiresAt.toISOString(),
    remainingSeconds: Math.max(0, Math.floor((expiresAt.getTime() - serverNow.getTime()) / 1000)),
    status: attempt.status as AttemptClock['status'],
  };
}

/**
 * Returns the student's live attempt for an exam, or null.
 * A 'submitted' or 'expired' attempt is not live, so a student may retake.
 *
 * Mode is part of the lookup on purpose. Without it, a student with a live
 * practice session would have that session resumed when they started a timed
 * exam â€” handing them practice-mode hints during a graded attempt, and making
 * a real exam impossible to start until the practice session is finished.
 */
export async function findLiveAttempt(
  studentId: string,
  examId: string,
  mode: 'exam' | 'practice'
): Promise<AttemptDoc | null> {
  return Attempt.findOne({ studentId, examId, mode, status: 'in_progress' })
    .sort({ startedAt: -1 })
    .exec();
}

/**
 * Marks any live attempt past its deadline as 'expired'.
 * Called before reading an attempt so a client cannot ignore the deadline.
 */
export async function expireIfOverdue(attempt: AttemptDoc): Promise<AttemptDoc> {
  if (attempt.status !== 'in_progress') return attempt;
  if (new Date(attempt.expiresAt).getTime() > Date.now()) return attempt;

  attempt.status = 'expired';
  attempt.submittedAt = new Date();
  await attempt.save();
  return attempt;
}
