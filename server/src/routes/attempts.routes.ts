import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Attempt, Exam, type AttemptDoc } from '../models/index.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  buildClock,
  expireIfOverdue,
  findLiveAttempt,
  toAttemptSummary,
} from '../services/attempt.service.js';
import { gradeAttempt, readSelected, readMarked } from '../services/grading.service.js';
import { toPublicQuestions } from '../services/question.service.js';
import type { StartAttemptResult } from '../../../shared/types.js';

export const attemptRouter = Router();
export const attemptsRouter = attemptRouter;

const startSchema = z.object({
  examId: z.string().min(1),
  code: z.string().optional(),
  title: z.string().optional(),
  mode: z.enum(['exam', 'practice']).default('exam'),
});

const idParam = z.object({ id: z.string().min(1) });

const stateSchema = z.object({
  currentIndex: z.number().int().min(0).optional(),
  selectedOptions: z.record(z.string(), z.number().int().min(1).max(9)).optional(),
  markedForReview: z.record(z.string(), z.boolean()).optional(),
  visitedQuestions: z.record(z.string(), z.boolean()).optional(),
});

/** Summary shape shared by the start and question endpoints. */
function summaryOf(exam: {
  _id: unknown;
  code: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  totalMarks: number;
  negativeMarking: number;
  difficulty: string;
  questions: { section: string }[];
}): StartAttemptResult['exam'] {
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
    sections: [...new Set(exam.questions.map((q) => q.section))],
    questionCount: exam.questions.length,
  };
}

/**
 * POST /api/attempts
 *
 * Starts (or resumes) an attempt. The server sets startedAt and expiresAt, so
 * the deadline cannot be influenced by the client.
 */
attemptRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = startSchema.parse(req.body);
    const studentId = req.user!.id;

    const rawKey = body.examId.trim();
    const cleanKey = rawKey
      .replace(/^new\s+(?:mock\s+test|practice\s+test|test)\s+published:\s*/i, '')
      .replace(/^(?:mock\s+test|practice\s+test|test):\s*/i, '')
      .trim();

    const searchKeys = Array.from(
      new Set(
        [
          rawKey,
          cleanKey,
          body.code?.trim(),
          body.title?.trim(),
        ].filter(Boolean) as string[]
      )
    );

    // Tier 1: Exact match by ObjectId (highest priority)
    let exam: (typeof Exam extends { new (...args: any[]): infer U } ? U : any) | null = null;
    for (const key of searchKeys) {
      if (mongoose.isValidObjectId(key)) {
        exam = await Exam.findOne({ _id: new mongoose.Types.ObjectId(key), published: true }).exec();
        if (exam) break;
      }
    }

    // Tier 2: Exact match by code (case-insensitive)
    if (!exam) {
      for (const key of searchKeys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        exam = await Exam.findOne({
          published: true,
          code: new RegExp(`^${escaped}$`, 'i'),
        }).exec();
        if (exam) break;
      }
    }

    // Tier 3: Exact match by full title (case-insensitive)
    if (!exam) {
      for (const key of searchKeys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        exam = await Exam.findOne({
          published: true,
          title: new RegExp(`^${escaped}$`, 'i'),
        }).exec();
        if (exam) break;
      }
    }

    // Tier 4: Fallback substring match only if no exact match was found, newest first
    if (!exam && cleanKey.length >= 3) {
      const escaped = cleanKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      exam = await Exam.findOne({
        published: true,
        $or: [
          { code: new RegExp(escaped, 'i') },
          { title: new RegExp(escaped, 'i') },
        ],
      })
        .sort({ createdAt: -1 })
        .exec();
    }
    if (!exam) throw new HttpError(404, 'not_found', 'Exam not found.');
    if (!exam.questions || exam.questions.length === 0) {
      throw new HttpError(409, 'empty_exam', 'This exam has no questions yet.');
    }

    // Resume rather than restart, so a refresh mid-exam does not reset progress.
    // Scoped to the requested mode so a live practice session is never resumed
    // as a timed exam (and vice versa).
    const existing = await findLiveAttempt(studentId, exam.id, body.mode);

    if (existing) {
      const attempt = await expireIfOverdue(existing);
      if (attempt.status === 'in_progress') {
        const result: StartAttemptResult = {
          attemptId: String(attempt._id),
          // The original mode is preserved on resume, so a student cannot switch
          // an in-flight exam attempt to practice mode to unlock hints.
          exam: summaryOf(exam),
          questions: toPublicQuestions(exam.questions, attempt.mode as 'exam' | 'practice'),
          clock: buildClock(attempt),
          state: {
            currentIndex: attempt.state?.currentIndex ?? 0,
            selectedOptions: readSelected(attempt),
            markedForReview: readMarked(attempt),
            visitedQuestions: attempt.state?.visitedQuestions
              ? (typeof attempt.state.visitedQuestions.get === 'function'
                  ? Object.fromEntries(attempt.state.visitedQuestions)
                  : { ...(attempt.state.visitedQuestions as object) })
              : {},
          },
        };
        res.json(result);
        return;
      }
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + exam.durationMinutes * 60 * 1000);

    const attempt = await Attempt.create({
      studentId,
      examId: exam._id,
      mode: body.mode,
      status: 'in_progress',
      startedAt,
      expiresAt,
      state: {
        currentIndex: 0,
        selectedOptions: new Map(),
        markedForReview: new Map(),
        visitedQuestions: new Map(),
      },
    });

    const result: StartAttemptResult = {
      attemptId: String(attempt._id),
      exam: summaryOf(exam),
      questions: toPublicQuestions(exam.questions, body.mode),
      clock: buildClock(attempt, startedAt),
    };
    res.status(201).json(result);
  })
);

/**
 * GET /api/attempts/:id/questions
 *
 * Returns PublicQuestion[] — `toPublicQuestions` strips correctOption and
 * explanation, and only includes a hint in practice mode.
 */
attemptRouter.get(
  '/:id/questions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const attempt = await loadOwnedAttempt(req.user!.id, id);

    if (attempt.status !== 'in_progress') {
      throw new HttpError(409, 'attempt_closed', 'This attempt is already submitted.');
    }

    const exam = await Exam.findById(attempt.examId).exec();
    if (!exam) throw new HttpError(404, 'not_found', 'Exam not found.');

    res.json({
      questions: toPublicQuestions(exam.questions ?? [], attempt.mode as 'exam' | 'practice'),
      clock: buildClock(attempt),
    });
  })
);

/** PATCH /api/attempts/:id/state — autosave, called roughly every 10 seconds. */
attemptRouter.patch(
  '/:id/state',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const patch = stateSchema.parse(req.body);
    const attempt = await loadOwnedAttempt(req.user!.id, id);

    if (attempt.status !== 'in_progress') {
      throw new HttpError(409, 'attempt_closed', 'This attempt is already submitted.');
    }

    // Update attempt state; replacing maps allows students to clear options cleanly.
    if (patch.currentIndex !== undefined) attempt.state.currentIndex = patch.currentIndex;
    if (patch.selectedOptions !== undefined) {
      attempt.state.selectedOptions = new Map(Object.entries(patch.selectedOptions));
    }
    if (patch.markedForReview !== undefined) {
      attempt.state.markedForReview = new Map(Object.entries(patch.markedForReview));
    }
    if (patch.visitedQuestions !== undefined) {
      attempt.state.visitedQuestions = new Map(Object.entries(patch.visitedQuestions));
    }

    await attempt.save();

    res.json({ ok: true, clock: buildClock(attempt) });
  })
);

/**
 * POST /api/attempts/:id/heartbeat
 *
 * The client re-syncs its countdown against the server clock. This is what
 * makes the timer tamper-resistant and tab-close-proof.
 */
attemptRouter.post(
  '/:id/heartbeat',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const attempt = await expireIfOverdue(await loadOwnedAttempt(req.user!.id, id));
    res.json({ clock: buildClock(attempt) });
  })
);

/**
 * POST /api/attempts/:id/submit
 *
 * The only endpoint that ever returns the answer key. Grading happens here on
 * the server; the browser's own score computation is ignored entirely.
 */
attemptRouter.post(
  '/:id/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    let attempt = await loadOwnedAttempt(req.user!.id, id);

    if (attempt.status === 'submitted') {
      throw new HttpError(409, 'already_submitted', 'This attempt was already submitted.');
    }

    // Save any state passed directly in the submit payload before grading
    if (req.body && typeof req.body === 'object') {
      const parsed = stateSchema.partial().safeParse(req.body);
      if (parsed.success && parsed.data) {
        const patch = parsed.data;
        if (patch.currentIndex !== undefined) attempt.state.currentIndex = patch.currentIndex;
        if (patch.selectedOptions !== undefined) {
          attempt.state.selectedOptions = new Map(Object.entries(patch.selectedOptions));
        }
        if (patch.markedForReview !== undefined) {
          attempt.state.markedForReview = new Map(Object.entries(patch.markedForReview));
        }
        if (patch.visitedQuestions !== undefined) {
          attempt.state.visitedQuestions = new Map(Object.entries(patch.visitedQuestions));
        }
      }
    }

    // A late submit is graded but marked expired, so the deadline is real.
    const expired = new Date(attempt.expiresAt).getTime() <= Date.now();
    attempt.status = expired ? 'expired' : 'submitted';
    attempt.submittedAt = new Date();
    await attempt.save();

    const exam = await Exam.findById(attempt.examId).exec();
    if (!exam) throw new HttpError(404, 'not_found', 'Exam not found.');

    const result = gradeAttempt(attempt, exam, exam.questions ?? []);

    attempt.score = result.totalScore;
    attempt.maxScore = result.maxScore;
    attempt.percentage = result.scorePercentage;
    attempt.correctCount = result.correctCount;
    attempt.incorrectCount = result.incorrectCount;
    attempt.unattemptedCount = result.unattemptedCount;
    attempt.markedCount = result.markedCount;
    await attempt.save();

    res.json({ result });
  })
);

/** GET /api/attempts — the signed-in student's attempt history. */
attemptRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const attempts = await Attempt.find({ studentId: req.user!.id, clearedByStudent: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();

    // Deliberately not using .populate(): combined with .lean() it replaces
    // examId with a nested document, which then stringifies to "[object Object]"
    // and loses the id the client needs. A second query is clearer and keeps
    // examId a clean value.
    const examIds = [...new Set(attempts.map((a) => a.examId))];
    const exams = await Exam.find({ _id: { $in: examIds } })
      .select('title code')
      .lean()
      .exec();
    const byId = new Map(exams.map((e) => [String(e._id), e]));

    res.json({
      attempts: attempts.map((a) =>
        toAttemptSummary(a as unknown as AttemptDoc, byId.get(String(a.examId)) ?? null)
      ),
    });
  })
);

/** DELETE /api/attempts/:id — student dismissing an attempt from their personal view */
attemptRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const student = req.user!;
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const attempt = await Attempt.findOneAndUpdate(
      { _id: id, studentId: student.id },
      { $set: { clearedByStudent: true, clearedAtStudent: new Date() } }
    ).exec();
    res.json({ ok: true, deleted: !!attempt, preservedForAdmin: true });
  })
);

/** DELETE /api/attempts — student clearing history from their personal view */
attemptRouter.delete(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const student = req.user!;
    const result = await Attempt.updateMany(
      { studentId: student.id, clearedByStudent: { $ne: true } },
      { $set: { clearedByStudent: true, clearedAtStudent: new Date() } }
    ).exec();
    res.json({ ok: true, attemptsCleared: result.modifiedCount, preservedForAdmin: true });
  })
);

/** Loads an attempt and asserts ownership, so one student cannot read another's. */
async function loadOwnedAttempt(studentId: string, attemptId: string): Promise<AttemptDoc> {
  if (!mongoose.isValidObjectId(attemptId)) {
    throw new HttpError(404, 'not_found', 'Attempt not found.');
  }
  const attempt = await Attempt.findById(attemptId).exec();
  if (!attempt) throw new HttpError(404, 'not_found', 'Attempt not found.');
  if (String(attempt.studentId) !== studentId) {
    throw new HttpError(403, 'forbidden', 'This attempt belongs to another student.');
  }
  return attempt;
}
