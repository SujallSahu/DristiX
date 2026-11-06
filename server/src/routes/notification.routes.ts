import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { Notification } from '../models/index.js';
import { User } from '../models/index.js';

export const notificationRouter = Router();

/**
 * GET /api/notifications
 * Retrieves all eligible notifications for the authenticated student.
 *
 * Eligibility Rule (Rule 5):
 * - Newly registered students initially receive 0 previous notifications.
 * - Eligible notifications are those published ON OR AFTER student's registration date (createdAt).
 * - Read/unread status is maintained across logins/sessions via readNotificationIds.
 */
notificationRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    // Rule 1: Admin Portal does not receive or display student-facing notifications
    if (userRole === 'ADMIN') {
      res.json({ notifications: [], unreadCount: 0 });
      return;
    }

    const user = await User.findById(userId)
      .select('createdAt readNotificationIds')
      .lean()
      .exec();

    if (!user) {
      res.json({ notifications: [], unreadCount: 0 });
      return;
    }

    const readSet = new Set(
      (user.readNotificationIds || []).map((id: unknown) => String(id))
    );

    // Filter strictly to notifications published after the student registered
    const studentRegisteredAt = user.createdAt || new Date(0);

    const items = await Notification.find({
      $or: [
        { targetType: 'ALL_STUDENTS', createdAt: { $gte: studentRegisteredAt } },
        { targetStudentIds: user._id },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();

    const notifications = items.map((doc: any) => ({
      id: String(doc._id),
      title: doc.title,
      message: doc.message,
      type: doc.type,
      testDetails: doc.testDetails || null,
      targetType: doc.targetType,
      senderRole: doc.senderRole,
      senderName: doc.senderName,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
      isRead: readSet.has(String(doc._id)),
    }));

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({ notifications, unreadCount });
  })
);

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read for the authenticated student.
 */
notificationRouter.patch(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);

    await User.findByIdAndUpdate(userId, {
      $addToSet: { readNotificationIds: id },
    }).exec();

    res.json({ ok: true, message: 'Notification marked as read.' });
  })
);

/**
 * PATCH /api/notifications/read-all
 * Mark all eligible notifications as read for the authenticated student.
 */
notificationRouter.patch(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const user = await User.findById(userId)
      .select('createdAt')
      .lean()
      .exec();

    if (!user) {
      res.json({ ok: true });
      return;
    }

    const studentRegisteredAt = user.createdAt || new Date(0);
    const eligibleNotifs = await Notification.find({
      $or: [
        { targetType: 'ALL_STUDENTS', createdAt: { $gte: studentRegisteredAt } },
        { targetStudentIds: user._id },
      ],
    })
      .select('_id')
      .lean()
      .exec();

    const ids = eligibleNotifs.map((n: any) => n._id);

    if (ids.length > 0) {
      await User.findByIdAndUpdate(userId, {
        $addToSet: { readNotificationIds: { $each: ids } },
      }).exec();
    }

    res.json({ ok: true, message: 'All notifications marked as read.' });
  })
);

