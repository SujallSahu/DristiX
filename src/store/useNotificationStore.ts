import { create } from 'zustand';
import type { AppNotification, NotificationTestDetails, NotificationType } from '../../shared/types';
import { getDataSource } from '../services/dataSource';
import { useAnnouncerStore } from './useAnnouncerStore';
import { soundEffects } from '../utils/soundEffects';
import { authBroadcastChannel } from './useAuthStore';

export function buildNotificationSpokenSummary(
  notifications: AppNotification[],
  unreadCount?: number
): string {
  if (!notifications || notifications.length === 0) {
    return 'Notifications panel opened. You have no notifications at this time.';
  }

  const unreadNotifs = notifications.filter((n) => !n.isRead);
  const pastNotifs = notifications.filter((n) => n.isRead);
  const effectiveUnread = typeof unreadCount === 'number' ? unreadCount : unreadNotifs.length;

  let speech = 'Notifications panel opened. ';

  if (effectiveUnread > 0) {
    speech += `You have ${effectiveUnread} new unread notification${effectiveUnread > 1 ? 's' : ''}. `;
    unreadNotifs.forEach((n, idx) => {
      const details = resolveNotificationTestDetails(n);
      const testAttachment = details?.testTitle
        ? ` Attached test: ${details.testTitle}. Say "Start test" or press Enter to launch.`
        : '';
      speech += `Notification ${idx + 1}: ${n.title}. ${n.message}.${testAttachment} `;
    });
  } else {
    speech += 'You have no new unread notifications. ';
    const latestTestNotif = notifications.find((n) => {
      const details = resolveNotificationTestDetails(n);
      return Boolean(details?.testId || details?.code || details?.testTitle);
    });
    if (latestTestNotif) {
      const details = resolveNotificationTestDetails(latestTestNotif);
      speech += `Latest test notification: ${latestTestNotif.title}. Say "Start test" or press Enter to launch ${details?.testTitle || 'examination'}. `;
    }
  }

  if (pastNotifs.length > 0) {
    speech += `Previously read notifications: `;
    pastNotifs.slice(0, 4).forEach((n, idx) => {
      const details = resolveNotificationTestDetails(n);
      const testAttachment = details?.testTitle ? ` Attached test: ${details.testTitle}.` : '';
      speech += `Past notification ${idx + 1}: ${n.title}.${testAttachment} `;
    });
    if (pastNotifs.length > 4) {
      speech += `plus ${pastNotifs.length - 4} older notifications. `;
    }
  }

  speech += 'Press Escape to close notifications, or say "Start test" to begin any attached examination.';
  return speech.trim();
}

/**
 * Universal resolver that reliably produces NotificationTestDetails even when notifications
 * were authored manually as announcements or have partially populated metadata.
 */
export function resolveNotificationTestDetails(
  notif: Partial<AppNotification> | null | undefined,
  catalog?: any[]
): NotificationTestDetails | null {
  if (!notif) return null;
  const existing = notif.testDetails || {};
  let testId = existing.testId ? String(existing.testId).trim() : null;
  let testTitle = existing.testTitle ? String(existing.testTitle).trim() : null;
  let code = existing.code ? String(existing.code).trim().toUpperCase() : null;
  const isPractice =
    existing.testType === 'practice' ||
    (typeof existing.testType === 'string' && existing.testType.toLowerCase().includes('practice')) ||
    (Boolean(notif.title) && notif.title!.toLowerCase().includes('practice')) ||
    (Boolean(notif.message) && notif.message!.toLowerCase().includes('practice'));
  const testType: 'exam' | 'practice' = isPractice ? 'practice' : 'exam';

  // 1. If not full metadata, attempt matching against available catalog exams
  const examStoreState = typeof window !== 'undefined' ? (window as any).__dristix_exam_store?.getState?.() : null;
  const availableExams: any[] = catalog || [
    ...(examStoreState?.availableExams || []),
    ...(examStoreState?.availablePracticeDrills || []),
  ];

  const combined = `${notif.title || ''} ${notif.message || ''}`.trim();
  const combinedLower = combined.toLowerCase();

  // Try matching against catalog items
  if (availableExams.length > 0) {
    // A. Match by code in combined text (e.g. DS-768, SSC-CGL-01)
    const matchByCode = availableExams.find(
      (e) => e.code && e.code.length >= 2 && combinedLower.includes(e.code.toLowerCase())
    );
    if (matchByCode) {
      return {
        testId: matchByCode.id || String(matchByCode._id) || testId,
        testTitle: matchByCode.title || testTitle || matchByCode.code,
        testType: matchByCode.category === 'Practice' || matchByCode.durationMinutes === 0 ? 'practice' : 'exam',
        code: matchByCode.code,
        durationMinutes: matchByCode.durationMinutes || existing.durationMinutes || null,
        totalMarks: matchByCode.totalMarks || existing.totalMarks || null,
      };
    }

    // B. Match by title in combined text (e.g. "Data Test", "SSC CGL")
    const matchByTitle = availableExams.find(
      (e) => e.title && e.title.length >= 3 && combinedLower.includes(e.title.toLowerCase())
    );
    if (matchByTitle) {
      return {
        testId: matchByTitle.id || String(matchByTitle._id) || testId,
        testTitle: matchByTitle.title,
        testType: matchByTitle.category === 'Practice' || matchByTitle.durationMinutes === 0 ? 'practice' : 'exam',
        code: matchByTitle.code || code,
        durationMinutes: matchByTitle.durationMinutes || existing.durationMinutes || null,
        totalMarks: matchByTitle.totalMarks || existing.totalMarks || null,
      };
    }
  }

  // 2. Extract title if missing
  if (!testTitle) {
    const rawTitle = notif.title || '';
    const cleanFromTitle = rawTitle
      .replace(/^new\s+(?:mock|moct|practice)?\s*(?:test|exam)?\s*(?:published|available)?:\s*/i, '')
      .replace(/^(?:mock|moct|practice)\s*(?:test|exam)?:\s*/i, '')
      .trim();
    if (cleanFromTitle && cleanFromTitle.toLowerCase() !== rawTitle.toLowerCase()) {
      testTitle = cleanFromTitle;
    } else if (notif.message) {
      const quoted = notif.message.match(/["']([^"']+)["']/);
      if (quoted?.[1]) {
        testTitle = quoted[1].trim();
      } else {
        const afterNewMatch = notif.message.match(/(?:start|take|new)\s+([A-Za-z0-9\s-]{3,30}?)\s+(?:test|exam|drill|available|in\s+the)/i);
        if (afterNewMatch?.[1]) {
          testTitle = afterNewMatch[1].trim();
        }
      }
    }
  }

  // 3. Extract code if missing (e.g. from "(DS-768)" or "(SSC-CGL-01)")
  if (!code && notif.message) {
    const codeMatch = notif.message.match(/\(([A-Za-z0-9_\-]{2,20})\)/);
    if (codeMatch?.[1]) code = codeMatch[1].trim().toUpperCase();
  }

  // If nothing identifiable was found, return null
  if (!testId && !testTitle && !code) {
    return null;
  }

  return {
    testId,
    testTitle: testTitle || code || 'Examination',
    testType,
    code,
    durationMinutes: existing.durationMinutes || null,
    totalMarks: existing.totalMarks || null,
  };
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  isOpen: boolean;
  activeNotification: AppNotification | null;
  adminSentNotifications: AppNotification[];
  isSending: boolean;

  fetchNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: (silent?: boolean) => Promise<void>;
  toggleOpen: (open?: boolean) => void;
  readNotificationsAloud: () => string;
  openNotificationDetail: (notif: AppNotification) => void;
  closeNotificationDetail: () => void;
  fetchAdminSentNotifications: () => Promise<void>;
  sendAdminNotification: (payload: {
    title: string;
    message: string;
    type?: NotificationType;
    testDetails?: NotificationTestDetails | null;
  }) => Promise<{ ok: boolean; message: string }>;
  deleteAdminNotification: (notificationId: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isOpen: false,
  activeNotification: null,
  adminSentNotifications: [],
  isSending: false,

  fetchNotifications: async () => {
    try {
      set({ isLoading: true });
      const data = await getDataSource().notifications.getStudentNotifications();
      set({
        notifications: data.notifications || [],
        unreadCount: data.unreadCount || 0,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  markAsRead: async (notificationId: string) => {
    // Optimistic update
    const current = get().notifications;
    const updated = current.map((n) =>
      n.id === notificationId ? { ...n, isRead: true } : n
    );
    const unread = updated.filter((n) => !n.isRead).length;
    set({ notifications: updated, unreadCount: unread });

    soundEffects.playSelect();
    useAnnouncerStore.getState().announce('Notification marked as read.', 'polite', true);

    try {
      await getDataSource().notifications.markNotificationRead(notificationId);
    } catch {}
  },

  markAllAsRead: async (silent?: boolean) => {
    const current = get().notifications;
    const updated = current.map((n) => ({ ...n, isRead: true }));
    set({ notifications: updated, unreadCount: 0 });

    if (!silent) {
      soundEffects.playSuccess();
      useAnnouncerStore.getState().announce('All notifications marked as read.', 'polite', true);
    }

    try {
      await getDataSource().notifications.markAllNotificationsRead();
    } catch {}
  },

  readNotificationsAloud: () => {
    const speech = buildNotificationSpokenSummary(get().notifications, get().unreadCount);
    soundEffects.playSelect();
    useAnnouncerStore.getState().announce(speech, 'assertive', true);
    return speech;
  },

  toggleOpen: (open?: boolean) => {
    const next = typeof open === 'boolean' ? open : !get().isOpen;
    if (next) {
      soundEffects.playSelect();
      const currentNotifs = get().notifications;
      const currentUnread = get().unreadCount;
      const speech = buildNotificationSpokenSummary(currentNotifs, currentUnread);
      useAnnouncerStore.getState().announce(speech, 'assertive', true);

      // Auto-mark all notifications as read upon opening without needing manual "Mark all read" click
      if (currentUnread > 0 || currentNotifs.some((n) => !n.isRead)) {
        const markedRead = currentNotifs.map((n) => ({ ...n, isRead: true }));
        set({ isOpen: true, notifications: markedRead, unreadCount: 0 });
        void getDataSource().notifications.markAllNotificationsRead().catch(() => {});
      } else {
        set({ isOpen: true });
      }
    } else {
      set({ isOpen: false });
    }
  },

  openNotificationDetail: (notif: AppNotification) => {
    set({ activeNotification: notif });
    if (!notif.isRead) {
      void get().markAsRead(notif.id);
    }

    // Comprehensive audio announcement for visually impaired students
    const testInfo = notif.testDetails?.testTitle
      ? ` Regarding test: ${notif.testDetails.testTitle}.`
      : '';
    useAnnouncerStore
      .getState()
      .announce(
        `Notification details: ${notif.title}.${testInfo} Message: ${notif.message}`,
        'assertive',
        true
      );
  },

  closeNotificationDetail: () => {
    set({ activeNotification: null });
    useAnnouncerStore.getState().announce('Notification details closed.', 'polite', true);
  },

  fetchAdminSentNotifications: async () => {
    try {
      const data = await getDataSource().notifications.getAdminSentNotifications();
      set({ adminSentNotifications: data.notifications || [] });
    } catch {}
  },

  sendAdminNotification: async (payload) => {
    try {
      set({ isSending: true });
      const res = await getDataSource().notifications.sendAdminNotification(payload);

      // Add to admin list
      if (res.notification) {
        set((state) => ({
          adminSentNotifications: [res.notification, ...state.adminSentNotifications],
          isSending: false,
        }));
      } else {
        set({ isSending: false });
      }

      // Broadcast across tabs and windows
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('dristix:notification-broadcast', { detail: res.notification })
          );
        }
        authBroadcastChannel?.postMessage({
          type: 'NOTIFICATION_BROADCAST',
          notification: res.notification,
        });
      } catch {}

      soundEffects.playSuccess();
      return { ok: true, message: res.message || 'Notification broadcasted successfully!' };
    } catch (err: any) {
      set({ isSending: false });
      return { ok: false, message: err?.message || 'Failed to send notification.' };
    }
  },

  deleteAdminNotification: async (notificationId: string) => {
    try {
      await getDataSource().notifications.deleteAdminNotification(notificationId);
      set((state) => ({
        adminSentNotifications: state.adminSentNotifications.filter((n) => n.id !== notificationId),
      }));
      soundEffects.playSelect();
    } catch {}
  },
}));

// Listen for broadcast notifications across browser tabs
if (typeof window !== 'undefined') {
  window.addEventListener('dristix:notification-broadcast', (event: any) => {
    const notif = event?.detail;
    if (notif && typeof notif === 'object' && notif.id) {
      const cur = useNotificationStore.getState().notifications;
      if (!cur.some((n) => n.id === notif.id)) {
        useNotificationStore.setState({
          notifications: [notif, ...cur],
          unreadCount: useNotificationStore.getState().unreadCount + 1,
        });
      }
    }
    void useNotificationStore.getState().fetchNotifications();
  });
  window.addEventListener('dristix:catalog-updated', () => {
    void useNotificationStore.getState().fetchNotifications();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'dristix_notifications_store_v1') {
      void useNotificationStore.getState().fetchNotifications();
    }
  });
}

