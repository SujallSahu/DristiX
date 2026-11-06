import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';
import type { AccessibilityPreference, UserRole } from '../../../shared/types.js';

/**
 * Users are students and administrators. Passwords are stored only as bcrypt
 * hashes — the plaintext never reaches the database.
 */
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    rollNumber: { type: String, required: true, unique: true, trim: true, index: true },
    /**
     * Optional short login name, used by administrators. Students sign in with
     * email or roll number instead, so this stays null for them.
     */
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['STUDENT', 'ADMIN'],
      default: 'STUDENT',
      index: true,
    },
    accessibilityPreference: {
      type: String,
      enum: ['Screen Reader', 'High Contrast', 'Low Vision', 'Standard'],
      default: null,
    },
    isGoogleAuthenticated: {
      type: Boolean,
      default: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    readNotificationIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Notification' }],
      default: [],
    },
  },
  { timestamps: true }
);

type UserShape = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserShape>;

export const User: Model<UserShape> =
  (mongoose.models.User as Model<UserShape>) ??
  mongoose.model<UserShape>('User', userSchema);

export type { AccessibilityPreference, UserRole };
