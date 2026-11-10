import React, { useEffect, useRef } from 'react';
import { X, Bell, Calendar, Award, BookOpen, Volume2 } from 'lucide-react';
import type { AppNotification } from '../../../shared/types';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import { resolveNotificationTestDetails } from '../../store/useNotificationStore';

interface StudentNotificationDetailModalProps {
  notification: AppNotification;
  onClose: () => void;
}

export const StudentNotificationDetailModal: React.FC<StudentNotificationDetailModalProps> = ({
  notification,
  onClose,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const { selectExam } = useExamStore();
  const effectiveDetails = resolveNotificationTestDetails(notification);

  useEffect(() => {
    modalRef.current?.focus();
    soundEffects.playSelect();

    const testInfo = effectiveDetails?.testTitle
      ? ` Regarding ${effectiveDetails.testType === 'practice' ? 'Practice Drill' : 'Mock Examination'}: ${effectiveDetails.testTitle}.`
      : '';
    const actionTip = effectiveDetails?.testId || effectiveDetails?.code || effectiveDetails?.testTitle
      ? ` Press Enter to start this ${effectiveDetails.testType === 'practice' ? 'practice drill' : 'mock examination'}.`
      : '';
    useAnnouncerStore
      .getState()
      .announce(
        `Notification details: ${notification.title}.${testInfo} Message: ${notification.message}.${actionTip} Press Escape to return.`,
        'assertive',
        true
      );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Enter' && (effectiveDetails?.testId || effectiveDetails?.code || effectiveDetails?.testTitle)) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'BUTTON') {
          e.preventDefault();
          e.stopPropagation();
          handleTakeTest();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notification, effectiveDetails, onClose]);

  const handleReadAloud = () => {
    soundEffects.playSelect();
    const testInfo = effectiveDetails?.testTitle
      ? `Regarding ${effectiveDetails.testType === 'practice' ? 'Practice Drill' : 'Mock Examination'}: ${effectiveDetails.testTitle}.`
      : '';
    const actionTip = effectiveDetails?.testId || effectiveDetails?.code || effectiveDetails?.testTitle
      ? ` Say "Start test" or click Start to begin.`
      : '';
    useAnnouncerStore
      .getState()
      .announce(
        `${notification.title}.${testInfo} Message: ${notification.message}.${actionTip}`,
        'assertive',
        true
      );
  };

  const handleTakeTest = () => {
    if (!effectiveDetails?.testId && !effectiveDetails?.code && !effectiveDetails?.testTitle) return;
    const mode = effectiveDetails.testType === 'practice' ? 'practice' : 'exam';
    const testTitle = effectiveDetails.testTitle || 'examination';
    soundEffects.playSelect();
    useAnnouncerStore
      .getState()
      .announce(
        `Starting ${testTitle} now. Loading question 1...`,
        'assertive',
        true
      );
    const targetId = effectiveDetails.testId || effectiveDetails.code || effectiveDetails.testTitle || '';
    void selectExam(targetId, mode, { testDetails: effectiveDetails });
    onClose();
  };

  const formattedDate = new Date(notification.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-detail-title"
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl bg-theme-surface border-2 border-theme-border shadow-2xl p-5 sm:p-6 space-y-4 focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-theme-border">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
              <Bell className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
                {notification.type === 'TEST_PUBLISHED'
                  ? 'New Test Released'
                  : notification.type === 'ANNOUNCEMENT'
                    ? 'Announcement'
                    : 'Notification'}
              </span>
              <h2
                id="notif-detail-title"
                className="text-base sm:text-lg font-black text-theme-text mt-1 leading-snug"
              >
                {notification.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notification details"
            className="p-1.5 rounded-lg border border-theme-border text-theme-text/70 hover:text-theme-text hover:bg-theme-surface transition cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Sender & Timestamp */}
        <div className="flex items-center justify-between text-xs text-theme-text/60">
          <span className="font-semibold">{notification.senderName}</span>
          <span className="flex items-center gap-1 font-mono text-[11px]">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            {formattedDate}
          </span>
        </div>

        {/* Message Content */}
        <div className="p-3.5 rounded-xl bg-theme-bg/60 border border-theme-border/60 text-sm leading-relaxed text-theme-text whitespace-pre-wrap">
          {notification.message}
        </div>

        {/* If Test Published, show action card */}
        {(effectiveDetails?.testId || effectiveDetails?.code || effectiveDetails?.testTitle) && (
          <div className="p-3.5 rounded-xl border-2 border-teal-500/40 bg-teal-500/5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">
                {effectiveDetails.testType === 'practice' ? (
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Award className="w-4 h-4" aria-hidden="true" />
                )}
                {effectiveDetails.testType === 'practice' ? 'Practice Drill' : 'Mock Examination'}
              </span>
              {effectiveDetails.code && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-theme-surface border border-theme-border">
                  {effectiveDetails.code}
                </span>
              )}
            </div>

            <div className="text-sm font-extrabold text-theme-text">
              {effectiveDetails.testTitle}
            </div>

            <div className="flex items-center gap-3 text-xs text-theme-text/70">
              {effectiveDetails.durationMinutes !== null &&
                effectiveDetails.durationMinutes !== undefined && (
                  <span>⏱️ {effectiveDetails.durationMinutes} min</span>
                )}
              {effectiveDetails.totalMarks !== null &&
                effectiveDetails.totalMarks !== undefined && (
                  <span>🏆 {effectiveDetails.totalMarks} marks</span>
                )}
            </div>

            <button
              type="button"
              onClick={handleTakeTest}
              className="w-full py-2.5 px-4 rounded-xl font-black text-sm bg-theme-primary text-theme-primary-text shadow-md hover:bg-theme-primary-hover transition flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-theme-focus"
            >
              <span>{effectiveDetails.testType === 'practice' ? 'Start Practice Drill' : 'Start Mock Examination'} &rarr;</span>
            </button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-theme-border">
          <button
            type="button"
            onClick={handleReadAloud}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-theme-border text-xs font-bold text-theme-text hover:bg-theme-surface transition cursor-pointer"
            title="Read this notification aloud with voice synthesizer"
          >
            <Volume2 className="w-4 h-4 text-teal-500" aria-hidden="true" />
            <span>Read Aloud</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-theme-surface border border-theme-border text-xs font-bold text-theme-text hover:bg-theme-border/40 transition cursor-pointer"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

