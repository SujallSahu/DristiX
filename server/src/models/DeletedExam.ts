import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';

const deletedExamSchema = new Schema(
  {
    examId: { type: String, required: true, index: true },
    code: { type: String, required: true, uppercase: true, index: true },
    title: { type: String, default: '' },
    deletedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

type DeletedExamShape = InferSchemaType<typeof deletedExamSchema>;
export type DeletedExamDoc = HydratedDocument<DeletedExamShape>;

export const DeletedExam: Model<DeletedExamShape> =
  (mongoose.models.DeletedExam as Model<DeletedExamShape>) ??
  mongoose.model<DeletedExamShape>('DeletedExam', deletedExamSchema);

