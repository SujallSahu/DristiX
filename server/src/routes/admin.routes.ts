import { Router } from 'express';
import { z } from 'zod';
import { Attempt, Exam, User } from '../models/index.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { requireAdmin, requireAuth } from '../middleware/requireAuth.js';
import { toAttemptSummary, toExamSummary } from '../services/attempt.service.js';
import type { AttemptDoc } from '../models/index.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

const optionSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().min(1).max(9),
  text: z.string().min(1),
  mathLatex: z.string().optional(),
});

const graphDataPointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
});

const graphSonificationSchema = z.object({
  enabled: z.boolean().default(true),
  spatialAudio: z.boolean().default(true),
  trendDetection: z.boolean().default(true),
  peakDetection: z.boolean().default(true),
  haptic: z.boolean().default(true),
  voiceDetail: z.enum(['minimal', 'standard', 'detailed']).default('standard'),
  minFrequency: z.number().default(250),
  maxFrequency: z.number().default(900),
});

const graphSchema = z.object({
  enabled: z.boolean().default(true),
  type: z.enum(['bar', 'line', 'pie']).default('bar'),
  title: z.string().default(''),
  xAxisLabel: z.string().default(''),
  yAxisLabel: z.string().default(''),
  unit: z.string().default(''),
  data: z.array(graphDataPointSchema).default([]),
  sonification: graphSonificationSchema.default({}),
});

const questionSchema = z.object({
  id: z.string().optional(),
  section: z.string().min(1),
  questionType: z.enum(['MCQ', 'DI']).default('MCQ'),
  questionText: z.string().min(1),
  mathLatex: z.string().optional(),
  diagramUrl: z.string().optional(),
  diagramType: z.enum(['image', 'svg', 'chart', 'geometry']).optional(),
  diagramDescription: z.string().optional(),
  diagramAiExplanation: z
    .object({
      visualBreakdown: z.array(z.string()).default([]),
      educationalContext: z.string().default(''),
      keyPoints: z.array(z.string()).default([]),
      audioNarration: z.string().default(''),
    })
    .optional(),
  graph: graphSchema.optional(),
  options: z.array(optionSchema).min(2),
  correctOption: z.number().int().min(1).max(9),
  explanation: z.string().default(''),
  hint: z.string().default(''),
});

const examSchema = z.object({
  code: z.string().trim().min(2),
  title: z.string().trim().min(2),
  description: z.string().default(''),
  category: z.string().default('Staff Selection'),
  durationMinutes: z.number().int().positive().max(600),
  totalMarks: z.number().int().positive(),
  negativeMarking: z.number().min(0).max(10).default(0),
  difficulty: z.enum(['Easy', 'Moderate', 'Challenging']).default('Moderate'),
  published: z.boolean().default(false),
  questions: z.array(questionSchema).min(1),
});

/** GET /api/admin/exams â€” includes unpublished, but still no answer keys. */
adminRouter.get(
  '/exams',
  asyncHandler(async (_req, res) => {
    const exams = await Exam.find().sort({ createdAt: -1 }).exec();
    res.json({
      exams: exams.map((e) => ({
        ...toExamSummary(e),
        published: e.published,
      })),
    });
  })
);

/** GET /api/admin/exams/:id â€” full details with answer keys for admin editing. */
adminRouter.get(
  '/exams/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const exam = await Exam.findById(id).exec();
    if (!exam) throw new HttpError(404, 'not_found', 'Exam not found.');

    res.json({
      exam: {
        id: String(exam._id),
        code: exam.code,
        title: exam.title,
        description: exam.description,
        category: exam.category,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        negativeMarking: String(exam.negativeMarking),
        difficulty: exam.difficulty,
        questionCount: exam.questions.length,
        questions: exam.questions.map((q, i) => ({
          id: q.id || `q-${i + 1}`,
          section: q.section,
          questionNumber: q.questionNumber || i + 1,
          questionType: (q as any).questionType || 'MCQ',
          questionText: q.questionText,
          mathLatex: q.mathLatex,
          diagramUrl: q.diagramUrl,
          diagramType: q.diagramType,
          diagramDescription: q.diagramDescription,
          diagramAiExplanation: q.diagramAiExplanation,
          graph: (q as any).graph,
          options: q.options,
          correctOption: q.correctOption,
          explanation: q.explanation,
          hint: q.hint,
        })),
      },
    });
  })
);

/** POST /api/admin/exams â€” create new exam with answer key. */
adminRouter.post(
  '/exams',
  asyncHandler(async (req, res) => {
    const body = examSchema.parse(req.body);

    const duplicate = await Exam.findOne({ code: body.code.toUpperCase() })
      .select('_id')
      .lean()
      .exec();
    if (duplicate) {
      throw new HttpError(409, 'duplicate_code', 'An exam with that code already exists.');
    }

    for (const [i, q] of body.questions.entries()) {
      if (!q.options.some((o) => o.number === q.correctOption)) {
        throw new HttpError(
          400,
          'invalid_answer_key',
          `Question ${i + 1}: correctOption ${q.correctOption} is not one of its options.`
        );
      }
    }

    const exam = await Exam.create({
      code: body.code.toUpperCase(),
      title: body.title,
      description: body.description,
      category: body.category,
      durationMinutes: body.durationMinutes,
      totalMarks: body.totalMarks,
      negativeMarking: body.negativeMarking,
      difficulty: body.difficulty,
      published: body.published,
      questions: body.questions.map((q, i) => ({
        id: q.id || `q-${i + 1}-${Date.now().toString(36)}`,
        questionNumber: i + 1,
        ...q,
      })),
    });

    res.status(201).json({ exam: toExamSummary(exam) });
  })
);

/** PUT /api/admin/exams/:id â€” update existing exam & its questions/answer key. */
adminRouter.put(
  '/exams/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = examSchema.parse(req.body);

    const exam = await Exam.findById(id).exec();
    if (!exam) throw new HttpError(404, 'not_found', 'Exam not found.');

    // Check code collision only if code changed
    if (exam.code !== body.code.toUpperCase()) {
      const duplicate = await Exam.findOne({
        code: body.code.toUpperCase(),
        _id: { $ne: exam._id },
      })
        .select('_id')
        .lean()
        .exec();
      if (duplicate) {
        throw new HttpError(409, 'duplicate_code', 'An exam with that code already exists.');
      }
    }

    for (const [i, q] of body.questions.entries()) {
      if (!q.options.some((o) => o.number === q.correctOption)) {
        throw new HttpError(
          400,
          'invalid_answer_key',
          `Question ${i + 1}: correctOption ${q.correctOption} is not one of its options.`
        );
      }
    }

    exam.code = body.code.toUpperCase();
    exam.title = body.title;
    exam.description = body.description;
    exam.category = body.category;
    exam.durationMinutes = body.durationMinutes;
    exam.totalMarks = body.totalMarks;
    exam.negativeMarking = body.negativeMarking;
    exam.difficulty = body.difficulty;
    exam.published = body.published;
    exam.questions = body.questions.map((q, i) => ({
      id: q.id || `q-${i + 1}-${Date.now().toString(36)}`,
      questionNumber: i + 1,
      ...q,
    })) as any;

    await exam.save();
    res.json({ exam: toExamSummary(exam) });
  })
);

/**
 * DELETE /api/admin/exams/:id
 *
 * Questions are embedded, so the exam and its answer keys disappear in one
 * document delete. Attempts still reference the id, so they are removed
 * explicitly â€” there is no database-level cascade to rely on.
 */
adminRouter.delete(
  '/exams/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);

    const exam = await Exam.findByIdAndDelete(id).exec();
    if (!exam) throw new HttpError(404, 'not_found', 'Exam not found.');

    const removed = await Attempt.deleteMany({ examId: exam._id }).exec();
    res.json({ ok: true, attemptsRemoved: removed.deletedCount });
  })
);

/** GET /api/admin/students â€” the roster. Admin only; never exposed to students. */
adminRouter.get(
  '/students',
  asyncHandler(async (_req, res) => {
    const students = await User.find({ role: 'STUDENT' })
      .select('name email rollNumber accessibilityPreference createdAt')
      .sort({ rollNumber: 1 })
      .lean()
      .exec();

    res.json({
      students: students.map((s: (typeof students)[number]) => ({
        id: String(s._id),
        name: s.name,
        email: s.email,
        rollNumber: s.rollNumber,
        accessibilityPreference: s.accessibilityPreference ?? null,
        registeredAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
      })),
    });
  })
);

/** DELETE /api/admin/students/:id â€” remove a registered student and their attempts. */
adminRouter.delete(
  '/students/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);

    const user = await User.findByIdAndDelete(id).exec();
    if (!user) throw new HttpError(404, 'not_found', 'Student account not found.');

    const attempts = await Attempt.deleteMany({ studentId: user._id }).exec();
    res.json({ ok: true, attemptsRemoved: attempts.deletedCount });
  })
);

/** GET /api/admin/submissions â€” every student's results. */
adminRouter.get(
  '/submissions',
  asyncHandler(async (req, res) => {
    const status = z
      .enum(['in_progress', 'submitted', 'expired'])
      .optional()
      .parse(req.query.status);

    const filter: Record<string, any> = {
      clearedByAdmin: { $ne: true },
    };
    if (status) filter.status = status;

    const attempts = await Attempt.find(filter)
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()
      .exec();

    // See the note in attempts.routes.ts: .populate() + .lean() would replace
    // examId/studentId with nested documents and stringify them badly.
    const examIds = [...new Set(attempts.map((a) => a.examId))];
    const studentIds = [...new Set(attempts.map((a) => a.studentId))];

    const [exams, students] = await Promise.all([
      Exam.find({ _id: { $in: examIds } }).select('title code').lean().exec(),
      User.find({ _id: { $in: studentIds } })
        .select('name rollNumber email')
        .lean()
        .exec(),
    ]);

    const examsById = new Map(exams.map((e) => [String(e._id), e]));
    const studentsById = new Map(students.map((s) => [String(s._id), s]));

    res.json({
      submissions: attempts.map((a) => {
        const student = studentsById.get(String(a.studentId));
        return {
          ...toAttemptSummary(
            a as unknown as AttemptDoc,
            examsById.get(String(a.examId)) ?? null
          ),
          student: {
            id: student ? String(student._id) : String(a.studentId),
            name: student?.name ?? '',
            rollNumber: student?.rollNumber ?? '',
            email: student?.email ?? '',
          },
          studentId: String(a.studentId),
        };
      }),
    });
  })
);

/** DELETE /api/admin/submissions/:id — remove a single test attempt */
adminRouter.delete(
  '/submissions/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const permanent = req.query.permanent === 'true';
    if (permanent) {
      const attempt = await Attempt.findByIdAndDelete(id).exec();
      res.json({ ok: true, deleted: !!attempt, permanent: true });
    } else {
      const attempt = await Attempt.findByIdAndUpdate(id, {
        $set: { clearedByAdmin: true, clearedAtAdmin: new Date() },
      }).exec();
      res.json({ ok: true, deleted: !!attempt, clearedForAdmin: true });
    }
  })
);

/** DELETE /api/admin/submissions/student/:identifier — remove all attempts for a student by ID or roll */
adminRouter.delete(
  '/submissions/student/:identifier',
  asyncHandler(async (req, res) => {
    const { identifier } = z.object({ identifier: z.string().min(1) }).parse(req.params);
    const student = await User.findOne({
      $or: [
        { _id: identifier.match(/^[0-9a-fA-F]{24}$/) ? identifier : null },
        { rollNumber: identifier },
      ],
    }).exec();

    const query = student ? { studentId: student._id } : { studentId: identifier };
    const permanent = req.query.permanent === 'true';
    if (permanent) {
      const result = await Attempt.deleteMany(query).exec();
      res.json({ ok: true, attemptsRemoved: result.deletedCount, permanent: true });
    } else {
      const result = await Attempt.updateMany(query, {
        $set: { clearedByAdmin: true, clearedAtAdmin: new Date() },
      }).exec();
      res.json({ ok: true, attemptsCleared: result.modifiedCount, clearedForAdmin: true });
    }
  })
);

/** DELETE /api/admin/submissions — purge all submissions (admin reset) */
adminRouter.delete(
  '/submissions',
  asyncHandler(async (req, res) => {
    const permanent = req.query.permanent === 'true';
    if (permanent) {
      const result = await Attempt.deleteMany({}).exec();
      res.json({ ok: true, attemptsRemoved: result.deletedCount, permanent: true });
    } else {
      const result = await Attempt.updateMany(
        { clearedByAdmin: { $ne: true } },
        { $set: { clearedByAdmin: true, clearedAtAdmin: new Date() } }
      ).exec();
      res.json({ ok: true, attemptsCleared: result.modifiedCount, clearedForAdmin: true });
    }
  })
);
