import React, { useEffect, useRef, useState } from 'react';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { Star, Mic, MicOff, Check, X, Send, Sparkles } from 'lucide-react';
import { isHindiPreferred } from '../../utils/voiceRecognition';

const PRESET_TAGS = [
  { id: 'audio_clear', en: 'Clear Audio', hi: 'स्पष्ट आवाज' },
  { id: 'good_questions', en: 'Great Questions', hi: 'अच्छे प्रश्न' },
  { id: 'time_sufficient', en: 'Ample Time', hi: 'पर्याप्त समय' },
  { id: 'helpful_solutions', en: 'Helpful Solutions', hi: 'उपयोगी हल' },
  { id: 'smooth_flow', en: 'Smooth Navigation', hi: 'सुगम संचालन' },
  { id: 'needs_improvement', en: 'Needs Improvement', hi: 'सुधार अपेक्षित' },
];

export const ExamFeedbackModal: React.FC = () => {
  const {
    feedback,
    setFeedbackRating,
    toggleFeedbackTag,
    setFeedbackComment,
    submitExamFeedback,
    skipExamFeedback,
    currentExam,
  } = useExamStore();

  const isHindi = isHindiPreferred();
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [isDictating, setIsDictating] = useState(false);
  const speechRecognitionRef = useRef<any>(null);

  // Focus management and entrance announcement
  useEffect(() => {
    if (feedback.isOpen) {
      setTimeout(() => {
        // Focus first star or container
        const firstStar = modalContainerRef.current?.querySelector<HTMLButtonElement>('[data-star="1"]');
        firstStar?.focus();
      }, 50);

      useAnnouncerStore
        .getState()
        .announce(
          isHindi
            ? 'परीक्षा फीडबैक विंडो खुली है। 1 से 5 स्टार रेटिंग दें, टैग चुनें, और बोलकर या लिखकर अपना अनुभव साझा करें। सबमिट करने के लिए Ctrl+Enter दबाएं या "फीडबैक सबमिट करो" बोलें।'
            : 'Exam feedback window is open. Rate 1 to 5 stars, select tags, and speak or type your feedback. Press Ctrl+Enter to submit or say "Submit feedback".',
          'assertive',
          true
        );
    }
  }, [feedback.isOpen, isHindi]);

  // Clean up any ongoing dictation when modal closes
  useEffect(() => {
    if (!feedback.isOpen && speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) { }
      setIsDictating(false);
    }
    return () => {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (_) { }
      }
    };
  }, [feedback.isOpen]);

  // Voice dictation using browser Web Speech API
  const startVoiceDictation = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      useAnnouncerStore
        .getState()
        .announce(
          isHindi ? 'आपका ब्राउज़र वॉयस डिक्टेशन का समर्थन नहीं करता।' : 'Speech dictation is not supported in this browser.',
          'assertive',
          true
        );
      return;
    }

    if (isDictating && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      setIsDictating(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = isHindi ? 'hi-IN' : 'en-IN';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsDictating(true);
        useAnnouncerStore
          .getState()
          .announce(
            isHindi ? 'सुन रहा हूँ, अपना फीडबैक बोलें।' : 'Listening, please speak your feedback.',
            'polite',
            true
          );
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          const currentComment = feedback.comment ? feedback.comment + ' ' : '';
          setFeedbackComment(currentComment + transcript.trim(), 'voice');
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error in feedback dictation:', e);
        setIsDictating(false);
      };

      recognition.onend = () => {
        setIsDictating(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Failed to start dictation:', err);
      setIsDictating(false);
    }
  };

  // Keyboard navigation & accessibility
  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Escape skips/closes
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (isDictating && speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      skipExamFeedback();
      return;
    }

    // Ctrl+Enter or Cmd+Enter submits
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      if (feedback.rating > 0) {
        submitExamFeedback();
      } else {
        useAnnouncerStore
          .getState()
          .announce(
            isHindi ? 'कृपया पहले 1 से 5 स्टार रेटिंग चुनें।' : 'Please choose a 1 to 5 star rating first.',
            'assertive',
            true
          );
      }
      return;
    }

    // Number keys 1-5 when not actively typing in the textarea
    if (
      ['1', '2', '3', '4', '5'].includes(e.key) &&
      document.activeElement !== commentInputRef.current
    ) {
      e.preventDefault();
      setFeedbackRating(Number(e.key), 'keyboard');
      return;
    }

    // Tab trap inside modal
    if (e.key === 'Tab') {
      const container = modalContainerRef.current;
      if (!container) return;

      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  };

  if (!feedback.isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          skipExamFeedback();
        }
      }}
    >
      <div
        ref={modalContainerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        aria-describedby="feedback-modal-desc"
        onKeyDown={handleModalKeyDown}
        className="w-full max-w-xl bg-theme-surface border-2 border-theme-border rounded-2xl shadow-2xl p-5 sm:p-7 relative text-theme-text overflow-y-auto max-h-[90vh] focus:outline-none"
        tabIndex={-1}
      >
        {/* Close / Skip button */}
        <button
          type="button"
          onClick={skipExamFeedback}
          className="absolute top-4 right-4 p-2 rounded-lg text-theme-text-secondary hover:text-theme-text hover:bg-theme-bg transition border border-transparent hover:border-theme-border focus:ring-4 focus:ring-theme-focus"
          aria-label={isHindi ? 'फीडबैक बंद करें या छोड़ें (Esc)' : 'Close or skip feedback (Esc)'}
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-theme-primary/10 text-theme-primary border border-theme-primary/20">
            <Sparkles className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h2 id="feedback-modal-title" className="text-xl sm:text-2xl font-black tracking-tight">
              {isHindi ? 'परीक्षा का अनुभव कैसा रहा?' : 'How Was Your Exam Experience?'}
            </h2>
            <p id="feedback-modal-desc" className="text-xs sm:text-sm text-theme-text-secondary mt-0.5">
              {currentExam?.title || 'Examination'} — {isHindi ? 'आपकी राय परीक्षा को और सुगम बनाती है।' : 'Your feedback empowers our accessibility features.'}
            </p>
          </div>
        </div>

        {/* 1 to 5 Star Rating */}
        <div className="mt-5 p-4 rounded-xl border border-theme-border bg-theme-bg/60">
          <label className="block text-sm font-bold text-theme-text mb-2.5">
            {isHindi ? 'स्टार रेटिंग चुनें (1 से 5):' : 'Rate Your Experience (1 to 5 Stars):'}
          </label>
          <div
            role="radiogroup"
            aria-label={isHindi ? 'रेटिंग 1 से 5 स्टार' : 'Rating 1 to 5 stars'}
            className="flex items-center gap-2 sm:gap-3 justify-center py-2"
          >
            {[1, 2, 3, 4, 5].map((starNum) => {
              const isSelected = feedback.rating >= starNum;
              const isExact = feedback.rating === starNum;
              return (
                <button
                  key={starNum}
                  type="button"
                  data-star={starNum}
                  role="radio"
                  aria-checked={isExact}
                  onClick={() => setFeedbackRating(starNum, 'keyboard')}
                  className={`p-2.5 sm:p-3 rounded-xl transition transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-theme-focus flex flex-col items-center gap-1 ${isSelected
                      ? 'text-amber-400 bg-amber-400/10 border-2 border-amber-400/30'
                      : 'text-theme-text-secondary hover:text-amber-400/80 bg-theme-surface border border-theme-border'
                    }`}
                  aria-label={
                    isHindi
                      ? `${starNum} स्टार रेटिंग ${isSelected ? '(चुना हुआ)' : ''}`
                      : `${starNum} Star${starNum > 1 ? 's' : ''} ${isSelected ? '(Selected)' : ''}`
                  }
                >
                  <Star
                    className={`w-7 h-7 sm:w-8 sm:h-8 transition ${isSelected ? 'fill-amber-400 stroke-amber-400' : 'stroke-current'
                      }`}
                  />
                  <span className="text-xs font-bold">{starNum}</span>
                </button>
              );
            })}
          </div>
          <div className="text-center text-xs sm:text-sm font-medium text-theme-text-secondary mt-1">
            {feedback.rating > 0
              ? isHindi
                ? `चुनी गई रेटिंग: ${feedback.rating} स्टार`
                : `Selected Rating: ${feedback.rating} out of 5 stars`
              : isHindi
                ? 'कीबोर्ड से 1-5 दबाएं या स्टार पर क्लिक करें।'
                : 'Press 1-5 on keyboard or click a star.'}
          </div>
        </div>

        {/* Quick Tags / Chips */}
        <div className="mt-4">
          <label className="block text-xs uppercase font-bold text-theme-text-secondary tracking-wider mb-2">
            {isHindi ? 'त्वरित टैग (चुनें या हटाएं):' : 'Quick Feedback Tags:'}
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_TAGS.map((tag) => {
              const isSelected = feedback.tags.includes(tag.id);
              const label = isHindi ? tag.hi : tag.en;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleFeedbackTag(tag.id, 'keyboard')}
                  aria-pressed={isSelected}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-1.5 border focus:ring-4 focus:ring-theme-focus ${isSelected
                        ? 'bg-theme-primary text-theme-primary-text border-theme-primary shadow-sm'
                        : 'bg-theme-bg text-theme-text border-theme-border hover:border-theme-primary'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Comment Textarea & Voice Dictate */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="feedback-comment" className="text-xs uppercase font-bold text-theme-text-secondary tracking-wider">
              {isHindi ? 'टिप्पणी या सुझाव (वैकल्पिक):' : 'Comments & Suggestions (Optional):'}
            </label>
            {/* Voice Dictation Button */}
            <button
              type="button"
              onClick={startVoiceDictation}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border ${isDictating
                  ? 'bg-red-500 text-white border-red-600 animate-pulse ring-4 ring-red-400/40'
                  : 'bg-theme-bg text-theme-text border-theme-border hover:border-theme-primary'
                }`}
              aria-label={
                isDictating
                  ? isHindi ? 'बोलना बंद करें' : 'Stop voice dictation'
                  : isHindi ? 'बोलकर लिखें (वॉयस डिक्टेशन शुरू करें)' : 'Dictate with voice'
              }
            >
              {isDictating ? (
                <>
                  <MicOff className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                  <span>{isHindi ? 'डिक्टेशन रोकें' : 'Stop Mic'}</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-theme-primary" aria-hidden="true" />
                  <span>{isHindi ? 'बोलकर लिखें' : 'Speak to Type'}</span>
                </>
              )}
            </button>
          </div>

          <textarea
            ref={commentInputRef}
            id="feedback-comment"
            rows={3}
            value={feedback.comment}
            onChange={(e) => setFeedbackComment(e.target.value, 'keyboard')}
            placeholder={
              isHindi
                ? 'अपना फीडबैक यहाँ लिखें या ऊपर "बोलकर लिखें" बटन दबाकर बोलें...'
                : 'Write your thoughts here, or click "Speak to Type" to dictate...'
            }
            className="w-full p-3 rounded-xl border-2 border-theme-border bg-theme-bg text-theme-text text-sm focus:border-theme-primary focus:ring-4 focus:ring-theme-focus outline-none resize-none transition"
            maxLength={1000}
          />
          <div className="flex justify-between text-[11px] text-theme-text-secondary mt-1">
            <span>{isHindi ? 'आवाज से भी दे सकते हैं: "फीडबैक सबमिट करो"' : 'Voice command: "Submit feedback"'}</span>
            <span>{feedback.comment.length} / 1000</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-6 pt-4 border-t border-theme-border flex flex-wrap justify-end items-center gap-3">
          <button
            type="button"
            onClick={skipExamFeedback}
            className="px-4 py-2 rounded-xl text-sm font-bold text-theme-text-secondary hover:text-theme-text hover:bg-theme-bg border border-transparent hover:border-theme-border transition focus:ring-4 focus:ring-theme-focus"
          >
            {isHindi ? 'छोड़ें (Skip)' : 'Skip Feedback'}
          </button>

          <button
            type="button"
            disabled={feedback.isSubmitting}
            onClick={submitExamFeedback}
            className={`px-5 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 transition focus:ring-4 focus:ring-theme-focus ${feedback.rating > 0
                  ? 'bg-theme-primary text-theme-primary-text hover:brightness-110 shadow-lg shadow-theme-primary/20'
                  : 'bg-theme-primary/50 text-theme-primary-text/80 cursor-not-allowed'
              }`}
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span>
              {feedback.isSubmitting
                ? isHindi ? 'दर्ज हो रहा है...' : 'Submitting...'
                : isHindi ? 'फीडबैक सबमिट करें (Ctrl+Enter)' : 'Submit Feedback (Ctrl+Enter)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
