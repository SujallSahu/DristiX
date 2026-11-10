import React, { useEffect, useRef } from 'react';
import { AlertOctagon, X, ArrowRight, ShieldAlert } from 'lucide-react';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';

export interface TestUnavailableModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onBrowseCatalog?: () => void;
  testTitle?: string;
  testCode?: string;
  testType?: 'exam' | 'practice';
  reason?: string;
}

export const TestUnavailableModal: React.FC<TestUnavailableModalProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
  onBrowseCatalog: propOnBrowse,
  testTitle: propTitle,
  testCode: propCode,
  testType: propType,
}) => {
  const { unavailableModal, setUnavailableModal, returnToCatalog } = useExamStore();

  const isOpen = propIsOpen !== undefined ? propIsOpen : unavailableModal.isOpen;
  const testTitle = propTitle || unavailableModal.testTitle || 'Selected Examination';
  const testCode = propCode || unavailableModal.testCode || '';
  const testType = propType || unavailableModal.testType || 'exam';

  const modalRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      setUnavailableModal({ isOpen: false });
    }
  };

  const handleBrowse = () => {
    handleClose();
    if (propOnBrowse) {
      propOnBrowse();
    } else {
      returnToCatalog();
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    soundEffects.playTimerAlert();
    setTimeout(() => {
      primaryBtnRef.current?.focus();
    }, 60);

    const announceMsg = `Test Unavailable. ${testTitle} is no longer available in the student portal. It has been removed or unpublished by the administrator. Your past results remain safely saved in your performance history, but this test cannot be retaken. Press Escape to close or Enter to browse available tests.`;
    useAnnouncerStore.getState().announce(announceMsg, 'assertive', true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, testTitle]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="test-unavailable-title"
      aria-describedby="test-unavailable-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg dx-glass border-2 border-red-500/80 rounded-2xl sm:rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl bg-theme-surface/95 text-theme-text space-y-5 animate-in zoom-in-95 duration-200"
      >
        {/* Header with Alert Icon & Close */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border-2 border-red-500/40 text-red-500 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
              <AlertOctagon className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <span className="inline-block text-[11px] font-black uppercase tracking-wider text-red-500 bg-red-500/10 px-2.5 py-0.5 rounded-full border border-red-500/30 mb-1">
                Test Unavailable • परीक्षा अनुपलब्ध है
              </span>
              <h2 id="test-unavailable-title" className="text-xl sm:text-2xl font-black text-theme-text leading-tight">
                Examination Removed by Administrator
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-xl border border-theme-border text-theme-text/70 hover:text-theme-text hover:bg-theme-bg transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Test Information Card */}
        <div className="p-4 rounded-xl bg-theme-bg/90 border border-theme-border/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-theme-text/70 font-semibold">
            <span>Test Name &amp; Code:</span>
            <span className="font-mono text-[11px] font-bold text-theme-primary px-2 py-0.5 rounded bg-theme-primary/10 border border-theme-primary/20">
              {testCode || 'CODE-N/A'}
            </span>
          </div>
          <p className="font-extrabold text-base text-theme-text leading-snug">
            {testTitle}
          </p>
          <div className="text-xs text-theme-text/60 flex items-center gap-2 pt-1 border-t border-theme-border/40">
            <span>Type: {testType === 'practice' ? 'Practice Test Drill' : 'Timed Mock Examination'}</span>
            <span>•</span>
            <span className="text-amber-500 font-bold">Status: Discontinued</span>
          </div>
        </div>

        {/* Detailed Explanation */}
        <p id="test-unavailable-desc" className="text-sm text-theme-text/80 leading-relaxed">
          This test is currently not available in the student portal mock test or practice test catalog because it has been removed or unpublished by the administrator.
        </p>

        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
          <span>
            <strong>Note:</strong> Your past score records, answers, and analytics for this test remain safely preserved in your student history. Only new test attempts and retakes are discontinued.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border-2 border-theme-border bg-theme-bg hover:bg-theme-surface text-theme-text font-bold text-sm transition cursor-pointer"
          >
            Dismiss (Esc)
          </button>
          <button
            ref={primaryBtnRef}
            type="button"
            onClick={handleBrowse}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-theme-primary text-theme-primary-text font-extrabold text-sm hover:brightness-110 active:scale-95 transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Browse Active Tests</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

