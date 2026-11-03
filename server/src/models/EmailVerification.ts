import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';

/**
 * Stores temporary, time-bound email verification OTPs for candidate registration.
 * Restricts registration strictly to verified Google Mail accounts.
 * A MongoDB TTL index on `expiresAt` automatically purges expired verification records.
 */
const emailVerificationSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    verificationToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

type EmailVerificationShape = InferSchemaType<typeof emailVerificationSchema>;
export type EmailVerificationDoc = HydratedDocument<EmailVerificationShape>;

export const EmailVerification: Model<EmailVerificationShape> =
  (mongoose.models.EmailVerification as Model<EmailVerificationShape>) ??
  mongoose.model<EmailVerificationShape>('EmailVerification', emailVerificationSchema);

