import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Exam } from '../models/index.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const examRouter = Router();

/**
 * Catalog projection.
 *
 * MongoDB forbids mixing inclusion and exclusion in a single `$project`, so this
 * runs as two stages: the first ADDS the derived fields, the second includes
 * only the safe ones.
 *
 * Note there is no `questions: 0` anywhere. The questions array is simply never
 * named in the final projection, so the answer key cannot be selected in the
 * first place rather than being filtered out after the fact.
 */
const DERIVED_FIELDS = {
  questionCount: { $size: { $ifNull: ['$questions', []] } },
  sections: { $setUnion: [{ $ifNull: ['$questions.section', []] }] },
};

const SAFE_FIELDS = {
  _id: 1,
  code: 1,
  title: 1,
  description: 1,
  category: 1,
  durationMinutes: 1,
  totalMarks: 1,
  negativeMarking: 1,
  difficulty: 1,
  questionCount: 1,
  sections: 1,
};

interface CatalogRow {
  _id: mongoose.Types.ObjectId;
  code: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  totalMarks: number;
  negativeMarking: number;
  difficulty: string;
  sections?: string[];
  questionCount?: number;
}

function toCatalogExam(e: CatalogRow) {
  return {
    id: String(e._id),
    code: e.code,
    title: e.title,
    description: e.description,
    category: e.category,
    durationMinutes: e.durationMinutes,
    totalMarks: e.totalMarks,
    negativeMarking:
      e.negativeMarking > 0
        ? `-${e.negativeMarking} marks per incorrect response`
        : 'No negative marking (Practice)',
    difficulty: e.difficulty,
    sections: e.sections ?? [],
    questionCount: e.questionCount ?? 0,
  };
}

/** GET /api/exams — catalog only, no questions, no answer keys. */
examRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const exams = await Exam.aggregate([
      { $match: { published: true } },
      { $set: DERIVED_FIELDS },
      { $project: SAFE_FIELDS },
      { $sort: { createdAt: -1 } },
    ]).exec();

    res.json({ exams: exams.map((e) => toCatalogExam(e as CatalogRow)) });
  })
);

/** GET /api/exams/:id — metadata and section names. Still no questions. */
examRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const rawId = id.trim();
    const cleanId = rawId
      .replace(/^new\s+(?:mock\s+test|practice\s+test|test)\s+published:\s*/i, '')
      .replace(/^(?:mock\s+test|practice\s+test|test):\s*/i, '')
      .trim();

    const searchKeys = Array.from(new Set([rawId, cleanId].filter(Boolean)));

    // Tier 1: Exact match by ObjectId (highest priority)
    let matchFilter: Record<string, unknown> | null = null;
    for (const key of searchKeys) {
      if (mongoose.isValidObjectId(key)) {
        const found = await Exam.findOne({ _id: new mongoose.Types.ObjectId(key), published: true }, { _id: 1 }).exec();
        if (found) {
          matchFilter = { _id: found._id, published: true };
          break;
        }
      }
    }

    // Tier 2: Exact match by code
    if (!matchFilter) {
      for (const key of searchKeys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const found = await Exam.findOne({ published: true, code: new RegExp(`^${escaped}$`, 'i') }, { _id: 1 }).exec();
        if (found) {
          matchFilter = { _id: found._id, published: true };
          break;
        }
      }
    }

    // Tier 3: Exact match by title
    if (!matchFilter) {
      for (const key of searchKeys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const found = await Exam.findOne({ published: true, title: new RegExp(`^${escaped}$`, 'i') }, { _id: 1 }).exec();
        if (found) {
          matchFilter = { _id: found._id, published: true };
          break;
        }
      }
    }

    // Tier 4: Fallback substring match, newest first
    if (!matchFilter && cleanId.length >= 3) {
      const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const found = await Exam.findOne({
        published: true,
        $or: [
          { code: new RegExp(escaped, 'i') },
          { title: new RegExp(escaped, 'i') },
        ],
      })
        .sort({ createdAt: -1 })
        .exec();
      if (found) {
        matchFilter = { _id: found._id, published: true };
      }
    }

    if (!matchFilter) throw new HttpError(404, 'not_found', 'Exam not found.');

    const [exam] = await Exam.aggregate([
      { $match: matchFilter },
      { $set: DERIVED_FIELDS },
      { $project: SAFE_FIELDS },
    ]).exec();

    if (!exam) throw new HttpError(404, 'not_found', 'Exam not found.');

    res.json({ exam: toCatalogExam(exam as CatalogRow) });
  })
);
