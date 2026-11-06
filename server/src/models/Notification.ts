import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';
import type { NotificationType } from '../../../shared/types.js';

const notificationSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    type: {
      type: String,
      enum: ['TEST_PUBLISHED', 'CUSTOM', 'ANNOUNCEMENT', 'SYSTEM'],
      default: 'CUSTOM',
      index: true,
    },
    testDetails: {
      testId: { type: String, default: null },
      testTitle: { type: String, default: null },
      testType: {
        type: String,
        enum: ['exam', 'practice', 'Mock Test', 'Practice Test', null],
        default: null,
      },
      code: { type: String, default: null },
      durationMinutes: { type: Number, default: null },
      totalMarks: { type: Number, default: null },
    },
    targetType: {
      type: String,
      enum: ['ALL_STUDENTS', 'SPECIFIC_STUDENTS'],
      default: 'ALL_STUDENTS',
      index: true,
    },
    targetStudentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    senderRole: {
      type: String,
      enum: ['ADMIN', 'SYSTEM'],
      default: 'ADMIN',
    },
    senderName: {
      type: String,
      default: 'DristiX Administration',
    },
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });

type NotificationShape = InferSchemaType<typeof notificationSchema>;
export type NotificationDoc = HydratedDocument<NotificationShape>;

export const Notification: Model<NotificationShape> =
  (mongoose.models.Notification as Model<NotificationShape>) ??
  mongoose.model<NotificationShape>('Notification', notificationSchema);

export type { NotificationType };

