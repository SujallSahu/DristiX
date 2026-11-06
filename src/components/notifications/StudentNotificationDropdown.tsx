import React, { useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  CheckCheck,
  Award,
  BookOpen,
  Megaphone,
  Info,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { useNotificationStore, resolveNotificationTestDetails } from '../../store/useNotificationStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import { StudentNotificationDetailModal } from './StudentNotificationDetailModal';
import type { AppNotification } from '../../../shared/types';

function formatRelativeTime(dateString: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (isNaN(diff) || diff < 0) return 'Just now';
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

export const StudentNotificationDropdown: React.FC = () => {
  const {
    notifications,
    unreadCount,
    isOpen,
    toggleOpen,
    markAsRead,
    markAllAsRead,
    activeNotification,
    openNotificationDetail,
    closeNotificationDetail,
    fetchNotifications,
  } = useNotificationStore();

  const { currentStudent } = useAuthStore();
  const { selectExam } = useExamStore();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Guarantee newest-first order across all renders and keyboard lookups
  const sortedNotifications = React.useMemo(() => {
    return [...notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [notifications]);

  // Fetch notifications on mount, when student changes, when tab regains focus, or on cross-tab broadcast
  useEffect(() => {
    if (!currentStudent) return;

    void fetchNotifications();

    const handleRefresh = () => {
      void fetchNotifications();
      void useExamStore.getState().loadCatalog();
    };

    window.addEventListener('focus', handleRefresh);
    window.addEventListener('dristix:notification-broadcast', handleRefresh);
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === 'dristix_notifications_store_v1' ||
        (e.key && e.key.startsWith('dristix_read_notifications_v1'))
      ) {
        handleRefresh();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener('dristix:notification-broadcast', handleRefresh);
      window.removeEventListener('storage', handleStorage);
    };
  }, [currentStudent, fetchNotifications]);

  const handleLaunchTest = useCallback(
    (
      e?: React.MouseEvent | React.KeyboardEvent | KeyboardEvent,
      notif?: AppNotification | null
    ) => {
      if (e?.stopPropagation) {
        e.stopPropagation();
      }
      if (!notif) return;
      const details = resolveNotificationTestDetails(notif);
      if (!details?.testId && !details?.code && !details?.testTitle) return;

      if (!notif.isRead) {
        void markAsRead(notif.id);
      }
      toggleOpen(false);

      const mode = details.testType === 'practice' ? 'practice' : 'exam';
      const testTitle = details.testTitle || 'examination';
      soundEffects.playSelect();
      useAnnouncerStore
        .getState()
        .announce(
          `Starting ${testTitle} now. Loading question 1...`,
          'assertive',
          true
        );
      const targetId = details.testId || details.code || details.testTitle || '';
      void selectExam(targetId, mode, { testDetails: details });
    },
    [markAsRead, toggleOpen, selectExam]
  );

  // Global Keyboard Shortcut: Press 'N' to toggle notifications when not typing in an input.
  // When notifications are open, pressing 'Enter' launches the attached test, and 'Escape' closes.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'n' || e.key === 'N') {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
        // Strict exam integrity: During an active live exam, 'N' advances to Next Question
        const examState = useExamStore.getState();
        if (examState.activeView === 'exam' && !examState.isSubmitted) {
          return;
        }
        e.preventDefault();
        toggleOpen();
        return;
      }

      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        toggleOpen(false);
        return;
      }

      // Enter key while dropdown is open and detail modal is not open
      if (e.key === 'Enter' && isOpen && !activeNotification) {
        const target = e.target as HTMLElement;
        // Don't intercept Enter if focused on the explicit "Close" or "Mark all read" button
        if (
          target.getAttribute('data-action') === 'close' ||
          target.getAttribute('data-action') === 'mark-all'
        ) {
          return;
        }

        // Check if user has focused inside a specific notification row
        const card = target.closest?.('[data-notification-id]') as HTMLElement | null;
        const cardId = card?.getAttribute('data-notification-id');
        let targetNotif = cardId ? sortedNotifications.find((n) => n.id === cardId) : null;

        // If not focused on a valid test notification, pick the newest notification with an attached test
        if (!targetNotif || !resolveNotificationTestDetails(targetNotif)) {
          targetNotif =
            sortedNotifications.find((n) => {
              const details = resolveNotificationTestDetails(n);
              return Boolean(details?.testId || details?.code || details?.testTitle);
            }) || null;
        }

        if (targetNotif) {
          e.preventDefault();
          e.stopPropagation();
          handleLaunchTest(e, targetNotif);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeNotification, notifications, toggleOpen, handleLaunchTest]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        toggleOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, toggleOpen]);

  // Auto-mark notifications as read immediately when user opens notification section
  useEffect(() => {
    if (isOpen && (unreadCount > 0 || notifications.some((n) => !n.isRead))) {
      void markAllAsRead(true);
    }
  }, [isOpen, unreadCount, notifications, markAllAsRead]);

  const getTypeIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'TEST_PUBLISHED':
        return <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />;
      case 'ANNOUNCEMENT':
        return <Megaphone className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />;
      case 'SYSTEM':
        return <Info className="w-4 h-4 text-amber-500" aria-hidden="true" />;
      default:
        return <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />;
    }
  };

  return (
    <>
      <div ref={dropdownRef} className="relative inline-block">
        {/* Notification Bell Button */}
        <button
          type="button"
          onClick={() => toggleOpen()}
          title={`Notifications (Shortcut: N). ${unreadCount} unread.`}
          aria-label={`Notifications. ${unreadCount} unread. Press N to view.`}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className={`relative p-2 rounded-lg border-2 transition flex items-center gap-1.5 focus:outline-none focus:ring-4 focus:ring-yellow-400 cursor-pointer ${unreadCount > 0
            ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300 shadow-sm'
            : 'border-theme-border bg-theme-bg text-theme-text hover:border-theme-primary'
            }`}
        >
          <Bell className="w-5 h-5" aria-hidden="true" />

          {/* Unread Counter Badge */}
          {unreadCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow-md animate-in zoom-in-50 duration-150"
              aria-hidden="true"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}

          <kbd className="hidden sm:inline-block text-[11px] font-sans font-bold px-1.5 py-0.5 rounded border border-theme-border bg-theme-surface text-theme-text">
            N
          </kbd>
        </button>

        {/* Dropdown Flyout Panel */}
        {isOpen && (
          <>
            {/* Backdrop click dismisser */}
            <div
              className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 sm:bg-transparent"
              onClick={() => toggleOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-label="Student Notifications Panel"
              className="fixed sm:absolute right-2 sm:right-0 top-16 sm:top-full mt-2 w-[calc(100vw-1.5rem)] sm:w-96 max-w-sm sm:max-w-none rounded-2xl bg-white dark:bg-[#031d22] border-2 border-theme-border shadow-2xl p-4 z-50 space-y-3 animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-theme-border">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  <span className="text-xs sm:text-sm font-black text-theme-text">
                    Notifications
                  </span>
                  {unreadCount > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-700 dark:text-rose-300">
                      {unreadCount} unread
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      All read
                    </span>
                  )}
                </div>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllAsRead()}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                    title="Mark all notifications as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {/* Notification List */}
              <div
                className="space-y-2 max-h-80 overflow-y-auto pr-1"
                role="feed"
                aria-label="Notification List"
              >
                {notifications.length === 0 ? (
                  <div className="py-8 px-4 text-center space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-theme-surface border border-theme-border flex items-center justify-center text-theme-text/40">
                      <Bell className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="text-xs font-bold text-theme-text">No Notifications Yet</div>
                    <p className="text-[11px] text-theme-text/60 leading-snug">
                      You will receive announcements, new mock tests, and practice drills here.
                    </p>
                  </div>
                ) : (
                  sortedNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      data-notification-id={notif.id}
                      onClick={() => openNotificationDetail(notif)}
                      role="article"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          const details = resolveNotificationTestDetails(notif);
                          if (details?.testId || details?.code || details?.testTitle) {
                            handleLaunchTest(e, notif);
                          } else {
                            openNotificationDetail(notif);
                          }
                        } else if (e.key === ' ') {
                          e.preventDefault();
                          openNotificationDetail(notif);
                        }
                      }}
                      className={`p-3 rounded-xl border-2 text-xs transition cursor-pointer space-y-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400 ${!notif.isRead
                        ? 'bg-teal-500/10 border-teal-500/40 hover:bg-teal-500/15'
                        : 'bg-theme-surface/50 border-theme-border/60 hover:bg-theme-surface opacity-85'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="flex items-center gap-1.5 font-extrabold text-theme-text truncate">
                          {!notif.isRead && (
                            <span
                              className="w-2 h-2 rounded-full bg-teal-500 shrink-0"
                              aria-label="Unread notification"
                            />
                          )}
                          <span className="shrink-0">{getTypeIcon(notif.type)}</span>
                          <span className="truncate">{notif.title}</span>
                        </span>
                        <span className="text-[10px] font-mono text-theme-text/60 shrink-0 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>

                      <p className="text-[11px] text-theme-text/75 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>

                      {/* Quick Action Button for Published Tests */}
                      {(() => {
                        const details = resolveNotificationTestDetails(notif);
                        if (!details?.testId && !details?.code && !details?.testTitle) return null;
                        return (
                          <div className="pt-1 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={(e) => handleLaunchTest(e, notif)}
                              className="py-1 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 cursor-pointer"
                            >
                              {details.testType === 'practice' ? (
                                <BookOpen className="w-3 h-3" aria-hidden="true" />
                              ) : (
                                <Award className="w-3 h-3" aria-hidden="true" />
                              )}
                              <span>
                                {details.testType === 'practice'
                                  ? 'Start Practice'
                                  : 'Start Mock Exam'}
                              </span>
                            </button>
                            <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 flex items-center gap-0.5">
                              <span>Details</span>
                              <ChevronRight className="w-3 h-3" aria-hidden="true" />
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="pt-2 border-t border-theme-border flex items-center justify-between text-[11px] font-semibold text-theme-text/60">
                <span className="text-[10px] text-theme-text/50">
                  Tip: Press <kbd className="font-mono px-1 rounded bg-theme-surface">N</kbd> to toggle
                </span>
                <button
                  type="button"
                  onClick={() => toggleOpen(false)}
                  className="text-theme-text hover:text-teal-600 font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Full Detail Modal */}
      {activeNotification && (
        <StudentNotificationDetailModal
          notification={activeNotification}
          onClose={closeNotificationDetail}
        />
      )}
    </>
  );
};
