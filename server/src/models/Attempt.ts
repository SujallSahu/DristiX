import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';

/**
 * One attempt at one exam.
 *
 * The deadline lives here as `expiresAt`, set once when the attempt is created.
 * The client only renders a countdown derived from it, so editing browser state
 * cannot extend an exam, and closing the tab does not reset the clock.
 */
const stateSchema = new Schema(
  {
    currentIndex: { type: Number, default: 0, min: 0 },
    // Maps serialise to plain JSON objects over the wire, which is exactly the
    // Record<string, number> shape the frontend already uses.
    selectedOptions: { type: Map, of: Number, default: () => new Map<string, number>() },
    markedForReview: { type: Map, of: Boolean, default: () => new Map<string, boolean>() },
    visitedQuestions: { type: Map, of: Boolean, default: () => new Map<string, boolean>() },
  },
  { _id: false }
);

const attemptSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },

    mode: { type: String, enum: ['exam', 'practice'], default: 'exam' },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'expired'],
      default: 'in_progress',
      index: true,
    },

    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    submittedAt: { type: Date, default: null },

    state: { type: stateSchema, default: () => ({}) },

    score: { type: Number, default: null },
    maxScore: { type: Number, default: null },
    percentage: { type: Number, default: null },
    correctCount: { type: Number, default: null },
    incorrectCount: { type: Number, default: null },
    unattemptedCount: { type: Number, default: null },
    markedCount: { type: Number, default: null },

    // Visibility / Deletion flags for independent history management
    clearedByStudent: { type: Boolean, default: false, index: true },
    clearedAtStudent: { type: Date, default: null },
    clearedByAdmin: { type: Boolean, default: false, index: true },
    clearedAtAdmin: { type: Date, default: null },
  },
  { timestamps: true }
);

// The hot path is "find my live attempt for this exam".
// The hot path is "find my live attempt for this exam in this mode".
attemptSchema.index({ studentId: 1, examId: 1, mode: 1, status: 1 });

type AttemptShape = InferSchemaType<typeof attemptSchema>;
export type AttemptDoc = HydratedDocument<AttemptShape>;

export const Attempt: Model<AttemptShape> =
  (mongoose.models.Attempt as Model<AttemptShape>) ??
  mongoose.model<AttemptShape>('Attempt', attemptSchema);
