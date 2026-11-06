import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Send,
  Users,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Clock,
  Award,
  Info,
  Bell,
  RefreshCw,
} from 'lucide-react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import type { NotificationType } from '../../../shared/types';

export const AdminNotificationManager: React.FC = () => {
  const {
    adminSentNotifications,
    fetchAdminSentNotifications,
    sendAdminNotification,
    deleteAdminNotification,
    isSending,
  } = useNotificationStore();

  const { students } = useAuthStore();
  const { availableExams, availablePracticeDrills } = useExamStore();
  const { announce } = useAnnouncerStore();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [type, setType] = useState<NotificationType>('ANNOUNCEMENT');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void fetchAdminSentNotifications();
  }, [fetchAdminSentNotifications]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!title.trim() || !message.trim()) {
      setErrorMessage('Please provide both a notification title and message.');
      soundEffects.playTimerAlert();
      announce('Please provide both a notification title and message.', 'assertive', true);
      return;
    }

    const allExams = [...availableExams, ...availablePracticeDrills];
    const attachedExam = allExams.find((e) => e.id === selectedExamId);

    const testDetails = attachedExam
      ? {
          testId: attachedExam.id,
          testTitle: attachedExam.title,
          testType: (attachedExam.category === 'Practice' || attachedExam.durationMinutes === 0 ? 'practice' : 'exam') as 'exam' | 'practice',
          code: attachedExam.code,
          durationMinutes: attachedExam.durationMinutes,
          totalMarks: attachedExam.totalMarks,
        }
      : undefined;

    const res = await sendAdminNotification({
      title: title.trim(),
      message: message.trim(),
      type: attachedExam ? 'TEST_PUBLISHED' : type,
      testDetails,
    });

    if (res.ok) {
      setSuccessMessage(
        `Notification "${title.trim()}" was successfully broadcast to all registered students!`
      );
      announce(
        `Notification broadcasted successfully to all ${students.length} registered students.`,
        'assertive',
        true
      );
      setTitle('');
      setMessage('');
      setSelectedExamId('');
      setType('ANNOUNCEMENT');
    } else {
      setErrorMessage(res.message);
      announce(`Failed to send notification: ${res.message}`, 'assertive', true);
    }
  };

  const handleDelete = async (id: string, notifTitle: string) => {
    if (confirm(`Are you sure you want to remove notification "${notifTitle}"?`)) {
      await deleteAdminNotification(id);
      announce(`Notification ${notifTitle} removed.`, 'polite', true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#008f7a]/15 via-[#005f73]/10 to-transparent border border-teal-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Megaphone className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-theme-text tracking-tight">
                Send Student Notifications
              </h2>
              <p className="text-xs sm:text-sm text-theme-text/70 font-semibold mt-0.5">
                Broadcast announcements, test releases, instructions, and critical alerts to the Student Portal.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-theme-surface/80 border border-theme-border text-xs font-bold text-theme-text shadow-sm">
          <Users className="w-4 h-4 text-teal-500" aria-hidden="true" />
          <span>Audience: </span>
          <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-300 font-extrabold font-mono">
            {students.length} Students
          </span>
        </div>
      </div>

      {/* Main Grid: Composer & History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Notification Composer */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-theme-border">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-[#008f7a]" aria-hidden="true" />
                <h3 className="text-base font-extrabold text-theme-text">Compose Notification</h3>
              </div>
              <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400">
                Delivers to All Candidates
              </span>
            </div>

            {/* Success Banner */}
            {successMessage && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-start gap-2.5 animate-in fade-in duration-150"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" aria-hidden="true" />
                <div className="flex-1">{successMessage}</div>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start gap-2.5 animate-in fade-in duration-150"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" aria-hidden="true" />
                <div className="flex-1">{errorMessage}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Notification Type */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-theme-text">
                  Notification Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ANNOUNCEMENT', label: 'Announcement', icon: Megaphone },
                    { id: 'CUSTOM', label: 'Instruction', icon: Bell },
                    { id: 'SYSTEM', label: 'System Notice', icon: Info },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setType(cat.id as NotificationType);
                        soundEffects.playSelect();
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-extrabold flex flex-col items-center gap-1.5 transition cursor-pointer ${type === cat.id
                        ? 'border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-200 shadow-2xs'
                        : 'border-theme-border bg-theme-bg text-theme-text/70 hover:bg-theme-surface hover:text-theme-text'
                        }`}
                    >
                      <cat.icon className="w-4 h-4" aria-hidden="true" />
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Attach Mock Test or Practice Drill */}
              <div className="space-y-1.5">
                <label htmlFor="admin-attach-exam" className="block text-xs font-extrabold text-theme-text">
                  Attach Mock Test or Practice Drill <span className="text-theme-text/50 font-normal">(Optional — links start button directly)</span>
                </label>
                <select
                  id="admin-attach-exam"
                  value={selectedExamId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSelectedExamId(newId);
                    const allExams = [...availableExams, ...availablePracticeDrills];
                    const chosen = allExams.find((ex) => ex.id === newId);
                    if (chosen) {
                      setType('TEST_PUBLISHED');
                      if (!title) {
                        setTitle(`New ${chosen.category === 'Practice' ? 'Practice Drill' : 'Mock Test'}: ${chosen.title}`);
                      }
                      if (!message) {
                        setMessage(
                          `A new test "${chosen.title}" (${chosen.code}) is now available in the student portal. Duration: ${chosen.durationMinutes} mins, Questions: ${chosen.questionCount || chosen.questions?.length || 0}.`
                        );
                      }
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-teal-400"
                >
                  <option value="">None (General announcement or notice)</option>
                  {availableExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      Mock Exam: {ex.title} ({ex.code})
                    </option>
                  ))}
                  {availablePracticeDrills.map((dr) => (
                    <option key={dr.id} value={dr.id}>
                      Practice Drill: {dr.title} ({dr.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label htmlFor="admin-notif-title" className="block text-xs font-extrabold text-theme-text">
                  Notification Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="admin-notif-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Schedule Update: SSC CGL Tier-1 Mock Test"
                  maxLength={200}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-teal-400 placeholder:text-theme-text/40"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-extrabold text-theme-text">
                  <label htmlFor="admin-notif-msg">
                    Notification Message <span className="text-red-500">*</span>
                  </label>
                  <span className="font-mono text-[10px] text-theme-text/50">
                    {message.length} / 2000
                  </span>
                </div>
                <textarea
                  id="admin-notif-msg"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write the complete announcement, instruction, or notice for all registered students..."
                  maxLength={2000}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-sm leading-relaxed focus:outline-none focus:ring-4 focus:ring-teal-400 placeholder:text-theme-text/40 resize-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSending}
                className="w-full py-3 px-4 rounded-xl font-black text-sm bg-gradient-to-r from-[#008f7a] to-[#007a68] hover:opacity-95 text-white shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Broadcasting to Students...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" aria-hidden="true" />
                    <span>Broadcast Notification to Students</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Sent Notifications History */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-theme-border">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#008f7a]" aria-hidden="true" />
                <h3 className="text-base font-extrabold text-theme-text">Previously Sent Notifications</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-theme-bg border border-theme-border">
                {adminSentNotifications.length} Sent
              </span>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {adminSentNotifications.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-full bg-theme-bg border border-theme-border flex items-center justify-center text-theme-text/40">
                    <Megaphone className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <div className="text-sm font-bold text-theme-text">No Notifications Sent Yet</div>
                  <p className="text-xs text-theme-text/60 leading-snug">
                    Use the composer to broadcast your first announcement or notice to students.
                  </p>
                </div>
              ) : (
                adminSentNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className="p-4 rounded-xl border border-theme-border bg-theme-bg/60 space-y-2 relative group hover:border-teal-500/30 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${notif.type === 'TEST_PUBLISHED'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : notif.type === 'ANNOUNCEMENT'
                                ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                                : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                              }`}
                          >
                            {notif.type === 'TEST_PUBLISHED'
                              ? 'Test Published'
                              : notif.type === 'ANNOUNCEMENT'
                                ? 'Announcement'
                                : 'Notice'}
                          </span>
                          <span className="text-[10px] font-mono text-theme-text/50">
                            {new Date(notif.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-theme-text">{notif.title}</h4>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(notif.id, notif.title)}
                        className="p-1 rounded text-theme-text/40 hover:text-red-500 transition cursor-pointer"
                        title="Delete notification"
                        aria-label={`Delete notification ${notif.title}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>

                    <p className="text-xs text-theme-text/75 leading-relaxed whitespace-pre-wrap">
                      {notif.message}
                    </p>

                    {notif.testDetails?.testTitle && (
                      <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20 text-[11px] font-bold text-teal-700 dark:text-teal-300 flex items-center gap-2">
                        <Award className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Attached Test: {notif.testDetails.testTitle}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

