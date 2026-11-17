import React, { useState, useEffect, useRef } from 'react';
import { voiceRecognition, applyVoiceLanguageChange } from '../../utils/voiceRecognition';
import type { VoiceLangMode } from '../../utils/voiceRecognition';

/**
 * Monotonic id for chat messages.
 *
 * `Date.now()` collides whenever two messages land in the same millisecond —
 * which happens routinely because StrictMode double-invokes effects, so the
 * error listener can fire twice. Duplicate React keys then break reconciliation
 * for the whole list.
 */
let messageCounter = 0;
const messageId = (prefix: string) => `${prefix}-${Date.now()}-${++messageCounter}`;
import type { VoiceState } from '../../utils/voiceRecognition';
import { speechEngine } from '../../utils/speechEngine';
import { processVoiceCommand, isPhantomNoise } from '../../utils/voiceCommandProcessor';
import type { CommandProcessResult } from '../../utils/voiceCommandProcessor';
import { geminiVoiceService } from '../../utils/geminiVoiceService';
import { GeminiLiveVoiceSession } from '../../utils/geminiLiveVoiceSession';
import type { LiveSessionState } from '../../utils/geminiLiveVoiceSession';
import { useExamStore } from '../../store/useExamStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import {
  Mic,
  Sparkles,
  Send,
  Minimize2,
  Activity,
  Bot,
  User,
  Key,
  Volume2,
  VolumeX,
  AlertCircle,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  action?: string;
  timestamp: number;
}

export const VoiceAssistantOrb: React.FC = () => {

  const { activeView, questions, currentIndex } = useExamStore();

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [liveState, setLiveState] = useState<LiveSessionState>('idle');
  /** Reason the live session failed, shown in the status bar. */
  const [liveError, setLiveError] = useState<string | null>(null);

  /**
   * Recognition language, in the order it is cycled.
   *
   * 'auto' follows the browser locale and retries the other language if it
   * hears nothing. This was previously a static label while the underlying
   * language was hardcoded to Hindi, so the badge was decorative only.
   */
  const [langMode, setLangMode] = useState<VoiceLangMode>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('dristix_voice_lang') as VoiceLangMode;
      if (saved === 'hi-IN' || saved === 'en-US') {
        voiceRecognition.setLanguage(saved);
        return saved;
      }
    }
    const current = voiceRecognition.getLanguageMode();
    if (current === 'hi-IN' || current === 'en-US') return current;
    return 'hi-IN';
  });
  const langLabel = langMode === 'hi-IN' ? 'हिन्दी' : 'English';

  const cycleLanguage = () => {
    // Strictly toggle between English and Hindi (no other languages supported)
    // Dynamically retrieve current language mode to prevent stale closure lock
    const currentMode = voiceRecognition.getLanguageMode() || langMode;
    const next: VoiceLangMode = currentMode === 'hi-IN' ? 'en-US' : 'hi-IN';
    setLangMode(next);
    applyVoiceLanguageChange(next);
    soundEffects.playSelect();
    useAnnouncerStore
      .getState()
      .announce(
        next === 'hi-IN'
          ? 'आवाज़ पहचान और जवाब हिन्दी में सेट कर दिया गया है। अब सभी उत्तर हिन्दी में दिए जाएंगे।'
          : 'Voice Assistant set to English. All voice responses will be in English.',
        'assertive',
        true
      );
  };

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [liveVolume, setLiveVolume] = useState<number>(0);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [typedInput, setTypedInput] = useState<string>('');
  const [showKeyConfig, setShowKeyConfig] = useState<boolean>(false);
  const [apiKeyVal, setApiKeyVal] = useState<string>(() => geminiVoiceService.getApiKey());
  const [keySaved, setKeySaved] = useState<boolean>(false);
  const [testingKey, setTestingKey] = useState<boolean>(false);
  const [keyValidationResult, setKeyValidationResult] = useState<{ ok: boolean; message: string; models?: string[] } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'msg-welcome',
      sender: 'assistant',
      text:
        (typeof localStorage !== 'undefined' && localStorage.getItem('dristix_voice_lang') === 'hi-IN')
          ? 'नमस्ते! मैं DristiX AI वॉयस असिस्टेंट हूँ। आप मुझसे हिन्दी में बात कर सकते हैं—मैं आपके सभी आदेशों का पालन करूँगा और हिन्दी में जवाब दूँगा। बोलने के लिए माइक दबाएँ या "V" दबाएँ।'
          : 'Hello! I am the DristiX Conversational AI Voice Assistant. You can speak to me in English or Hindi—I will execute your commands and answer in English or Hindi. Tap the microphone or press "V" to speak.',
      timestamp: 0,
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<GeminiLiveVoiceSession | null>(null);
  const lastExecutedQueryRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  // Synchronize language mode whenever changed via voice command or external control
  useEffect(() => {
    const handleLanguageChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.lang) {
        setLangMode(detail.lang);
      }
    };
    window.addEventListener('dristix:language-change', handleLanguageChange);

    // Global stop speech listener: halt any active assistant speech, abort in-flight requests, and reset state
    const handleStopSpeech = () => {
      geminiVoiceService.abortActiveRequest();
      if (liveSessionRef.current) {
        if (liveSessionRef.current.getState() === 'assistant_speaking' || liveSessionRef.current.getState() === 'processing') {
          liveSessionRef.current.stop();
          // Short delay then resume listening if orb was active
          setTimeout(() => {
            if (isExpanded) {
              void liveSessionRef.current?.start();
            }
          }, 200);
        }
      }
      setLiveState('listening');
      setInterimTranscript('');
    };
    window.addEventListener('dristix-stop-speech', handleStopSpeech);

    const handleToggleLanguageEvent = () => {
      cycleLanguage();
    };
    window.addEventListener('dristix-toggle-voice-language', handleToggleLanguageEvent);

    return () => {
      window.removeEventListener('dristix:language-change', handleLanguageChange);
      window.removeEventListener('dristix-stop-speech', handleStopSpeech);
      window.removeEventListener('dristix-toggle-voice-language', handleToggleLanguageEvent);
    };
  }, [isExpanded, langMode]);

  const handleExecuteQuery = async (query: string, alternatives?: string[]) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    // Suppress phantom noise hallucinations (such as 'so', 'sau', etc.) from ambient background
    if (isPhantomNoise(cleanQuery)) {
      console.log('🔇 Suppressed phantom noise query in VoiceAssistantOrb:', cleanQuery);
      return;
    }

    // Rapid duplicate suppression (only drops instant Web Speech API double-firing within 350ms)
    // Allows candidates to intentionally repeat commands (e.g. "अगला" / "Next", "विकल्प 2", "समय", "बैक")
    const now = Date.now();
    if (
      lastExecutedQueryRef.current.text === cleanQuery &&
      now - lastExecutedQueryRef.current.time < 350
    ) {
      console.log('🔇 Suppressed rapid Web Speech API duplicate event within 350ms:', cleanQuery);
      return;
    }
    lastExecutedQueryRef.current = { text: cleanQuery, time: now };

    // Check for explicit stop / interrupt command while assistant is talking
    const isInterruptCmd = /^(stop|ruko|ruk jao|chup|pause|quiet|bas karo|shant|band karo)$/i.test(cleanQuery);
    if (isInterruptCmd && speechEngine.isSpeaking()) {
      speechEngine.stop();
      soundEffects.playSelect();
      return;
    }

    // Acoustic Echo Guard: Prevent assistant from hearing its own speakers in a loop
    if (speechEngine.isTextEcho(cleanQuery)) {
      console.log('🔇 Suppressed acoustic speaker echo query:', cleanQuery);
      return;
    }

    // If assistant is actively vocalizing and candidate provides a genuine new utterance, interrupt assistant immediately
    if (speechEngine.isSpeaking()) {
      speechEngine.stop();
    }

    const validAlternatives = alternatives
      ? alternatives.filter((alt) => !speechEngine.isTextEcho(alt) && !isPhantomNoise(alt))
      : [];

    let result: CommandProcessResult | null = null;
    const candidates = [cleanQuery, ...validAlternatives];

    // 2. High-Precision Instant Local NLP (0ms execution for exam navigation, options, timer, submit, etc.)
    const localResult = processVoiceCommand(candidates);
    if (
      localResult &&
      localResult.success &&
      localResult.intent !== 'FALLBACK' &&
      localResult.intent !== 'UNRECOGNIZED'
    ) {
      result = localResult;
    }

    // 3. Fallback to Gemini/Groq for conversational queries or open-ended speech
    if (!result && geminiVoiceService.hasApiKey()) {
      try {
        result = await geminiVoiceService.processTextWithGemini(cleanQuery);
      } catch (err) {
        console.warn('Gemini text fallback to local NLP:', err);
      }
    }

    // 4. Ultimate fallback to local engine
    if (!result) {
      const fallbackResult = localResult || processVoiceCommand(candidates);
      if (fallbackResult.intent !== 'UNRECOGNIZED') {
        result = fallbackResult;
      }
    }

    // 1. Append user message (prefer clean recognized query over noisy run-on transcript)
    const displayText = (result && result.intent !== 'UNRECOGNIZED' && result.userQuery)
      ? result.userQuery
      : cleanQuery;

    const userMsg: ChatMessage = {
      id: messageId('user'),
      sender: 'user',
      text: displayText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsExpanded(true);

    if (result && result.assistantReply) {
      // 4. Append assistant reply
      const assistantMsg: ChatMessage = {
        id: messageId('assistant'),
        sender: 'assistant',
        text: result.assistantReply,
        action: result.actionExecuted,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Ensure speech announcement is made if not already announced by local NLP
      if (result !== localResult && !speechEngine.isSpeaking()) {
        useAnnouncerStore.getState().announce(result.assistantReply, 'assertive', true);
      }
    }
  };

  const isTogglingRef = useRef(false);

  // Primary Voice Toggle: Unified Gemini Live Voice Session with instant fallback
  const handleToggleMic = async () => {
    if (isTogglingRef.current) return;
    isTogglingRef.current = true;

    try {
      const session = liveSessionRef.current;
      if (session) {
        if (session.getState() !== 'idle') {
          session.stop();
          setLiveState('idle');
          setLiveError(null);
          setInterimTranscript('');
        } else {
          setIsExpanded(true);
          setLiveError(null);
          // start() returns false when recognition is unavailable; it has already
          // reported why through onError, so the panel must not keep implying the
          // microphone is live.
          const started = await session.start();
          if (!started) {
            setIsExpanded(true);
            setLiveState('error');
            return;
          }
        }
        return;
      }

      const active = voiceRecognition.toggle();
      if (active) {
        soundEffects.playMicStart();
        setIsExpanded(true);
      } else {
        soundEffects.playMicStop();
      }
    } finally {
      setTimeout(() => {
        isTogglingRef.current = false;
      }, 150);
    }
  };

  // Auto-scroll messages
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isExpanded, interimTranscript]);

  // Setup Gemini Live Voice Session (ChatGPT/Gemini style multimodal live workflow)
  useEffect(() => {
    const session = new GeminiLiveVoiceSession({
      onStateChange: (state) => {
        setLiveState(state);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dristix-voice-state-change', { detail: { state } }));
        }
      },
      onVolumeChange: (vol) => {
        setLiveVolume(vol);
      },
      onLiveTranscript: (transcript, isFinal) => {
        if (!isFinal) {
          setInterimTranscript(transcript);
        } else {
          setInterimTranscript('');
        }
      },
      onResult: (result) => {
        setMessages((prev) => [
          ...prev,
          {
            id: messageId('user'),
            sender: 'user',
            text: result.userQuery,
            timestamp: Date.now(),
          },
          {
            id: messageId('asst'),
            sender: 'assistant',
            text: result.assistantReply,
            action: result.actionExecuted,
            timestamp: Date.now(),
          },
        ]);
      },
      onError: (errMsg) => {
        // Reset the indicators too. Previously only a chat message was added,
        // so the orb kept showing "Live / Hearing you" after recognition had
        // already failed, which reads as a frozen microphone.
        setLiveState('error');
        setVoiceState('error');
        setLiveError(errMsg);
        setLiveVolume(0);
        setInterimTranscript('');
        setMessages((prev) => [
          ...prev,
          {
            id: messageId('err'),
            sender: 'assistant',
            text: `⚠️ ${errMsg}`,
            timestamp: Date.now(),
          },
        ]);
      },
    });

    liveSessionRef.current = session;

    // Listen for global shortcut toggle event
    const handleGlobalToggle = () => {
      handleToggleMic();
    };
    window.addEventListener('dristix-toggle-voice', handleGlobalToggle);

    return () => {
      session.stop();
      window.removeEventListener('dristix-toggle-voice', handleGlobalToggle);
    };
  }, []);

  // Universal Stop Speaking & Language Switch Handler for DristiX Voice Assistant
  // Listens in capture phase for S, s, KeyS, Escape, or Hindi InScript keys ('े' / 'स' / 'ए')
  // Stop shortcut S operates strictly in student portal after login.
  // Also supports Alt+L or physical KeyL ('त' / 'ल') to switch language across both English and Hindi
  useEffect(() => {
    const handleVoiceAssistantKeyDown = (e: KeyboardEvent) => {
      const isStopKey =
        (
          (e.key && (e.key.toLowerCase() === 's' || e.key === 'े' || e.key === 'स' || e.key === 'ए')) ||
          e.code === 'KeyS' ||
          e.keyCode === 83 ||
          e.which === 83
        ) &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey;

      const isToggleVoiceKey =
        (
          (e.key && (e.key.toLowerCase() === 'v' || e.key === 'ल' || e.key === 'न')) ||
          e.code === 'KeyV' ||
          e.keyCode === 86 ||
          e.which === 86 ||
          (e.altKey && (e.key?.toLowerCase() === 'v' || e.code === 'KeyV' || e.key === 'ल' || e.key === 'न'))
        ) &&
        !e.ctrlKey &&
        !e.metaKey;

      const isLangKey =
        (
          (e.key && (e.key.toLowerCase() === 'l' || e.key === 'त' || e.key === 'ल')) ||
          e.code === 'KeyL' ||
          e.keyCode === 76 ||
          e.which === 76
        ) &&
        !e.ctrlKey &&
        !e.metaKey;

      const isEscapeKey = e.key === 'Escape';

      const isSpeakingNow =
        liveState === 'assistant_speaking' ||
        speechEngine.isSpeaking() ||
        voiceRecognition.getState() === 'speaking';

      const isStudentPortal =
        Boolean(useAuthStore.getState().currentStudent) &&
        !(typeof window !== 'undefined' && window.location.pathname.startsWith('/admin'));

      // S key stops speech only in the student portal after login
      if ((isStopKey && isStudentPortal || isEscapeKey) && isSpeakingNow) {
        e.preventDefault();
        e.stopPropagation();
        useAnnouncerStore.getState().stopSpeech();
        if (liveSessionRef.current) {
          liveSessionRef.current.interruptSpeaking();
        }
        soundEffects.playSelect();
        return;
      }

      // V key toggles voice assistant
      const activeEl = document.activeElement;
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'TEXTAREA' ||
          (activeEl.tagName === 'INPUT' &&
            ['text', 'search', 'password', 'email', 'tel', 'url', 'number'].includes(
              ((activeEl as HTMLInputElement).type || 'text').toLowerCase()
            )));

      if (isToggleVoiceKey && (!isTyping || e.altKey)) {
        e.preventDefault();
        e.stopPropagation();
        handleToggleMic();
        return;
      }

      if (e.altKey && isLangKey) {
        e.preventDefault();
        e.stopPropagation();
        cycleLanguage();
        return;
      }
    };

    window.addEventListener('keydown', handleVoiceAssistantKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleVoiceAssistantKeyDown, true);
    };
  }, [liveState]);

  // Connect local Web Speech fallback callbacks
  useEffect(() => {
    const unsubscribe = voiceRecognition.addListener({
      onTranscript: (transcript: string, isFinal: boolean, alternatives?: string[]) => {
        if (!isFinal) {
          setInterimTranscript(transcript);
        } else {
          setInterimTranscript('');
          // Only execute fallback directly if Gemini Live Session is not active
          if (!liveSessionRef.current || liveSessionRef.current.getState() === 'idle') {
            handleExecuteQuery(transcript, alternatives);
          }
        }
      },
      onStateChange: (state: VoiceState) => {
        setVoiceState(state);
      },
      onError: (errMsg: string) => {
        setMessages((prev) => [
          ...prev,
          {
            id: messageId('err'),
            sender: 'assistant',
            text: `⚠️ ${errMsg}`,
            timestamp: Date.now(),
          },
        ]);
      },
    });

    return unsubscribe;
  }, []);

  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedInput.trim()) return;
    const text = typedInput;
    setTypedInput('');
    handleExecuteQuery(text);
  };

  // Dynamic Suggestion Chips tailored to current page
  const suggestionChips = (() => {
    if (activeView === 'catalog') {
      return [
        'Read notifications',
        'List available exams',
        'Start SSC CGL test',
        'Scroll down',
        'Go to Practice Arena',
      ];
    } else if (activeView === 'exam') {
      const curQ = questions?.[currentIndex];
      const chips: string[] = [
        'Read question',
        'Select Option 2',
      ];
      if (curQ?.mathLatex) {
        chips.push(curQ.mathLatex.includes('^2') ? 'Explain quadratic equation' : 'Explain equation');
      }
      if (curQ?.graph && curQ.graph.enabled) {
        chips.push('Explain graph');
      }
      if (curQ?.diagramUrl || curQ?.diagramAiExplanation || curQ?.diagramDescription) {
        chips.push('Explain diagram');
      }
      chips.push('Next question');
      chips.push('How much time is left?');
      chips.push('Scroll down');
      return chips;
    } else {
      return [
        'Go to mock test page',
        'Choose another exam',
        'Scroll down',
        'Read report summary',
        'Retake test',
      ];
    }
  })();

  const isGeminiLiveActive = liveState !== 'idle';
  const isWebSpeechActive = voiceState === 'listening';
  const isAnyListening = isGeminiLiveActive || isWebSpeechActive;

  return (
    <aside
      aria-label="AI Conversational Voice Assistant (Shortcut: V)"
      className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-40 flex flex-col items-end select-none font-sans"
    >
      {/* Expanded Conversation Drawer */}
      {isExpanded && (
        <div
          role="region"
          aria-label="AI Conversation Window"
          className="w-[calc(100vw-1.5rem)] sm:w-96 max-w-sm max-h-[75vh] mb-3 bg-theme-surface border-2 border-theme-border rounded-2xl shadow-2xl flex flex-col overflow-hidden text-theme-text transition-all animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Header */}
          <div className="p-2.5 sm:p-3.5 bg-gradient-to-r from-teal-900/50 via-emerald-900/40 to-teal-800/50 border-b-2 border-theme-border flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-sm shrink-0">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold text-xs sm:text-sm text-theme-text flex items-center gap-1.5 leading-tight truncate">
                  <span><span className="hidden xs:inline">DristiX </span>Voice Agent</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono font-bold border border-emerald-500/30">
                    Live
                  </span>
                </h3>
                <span className="text-[11px] text-theme-text/70 block">
                  Hindi & English • Shortcut: <kbd className="font-mono font-bold text-amber-700 dark:text-yellow-400">V</kbd>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Emergency Stop Speech & Assistant Button (Shortcut: S or Esc) */}
              <button
                type="button"
                onClick={() => {
                  useAnnouncerStore.getState().stopSpeech();
                  liveSessionRef.current?.interruptSpeaking();
                  soundEffects.playSelect();
                }}
                title="Stop voice assistant speaking immediately (Shortcut: S or Esc)"
                aria-label="Stop voice assistant speaking immediately (Shortcut: S or Esc)"
                className="px-2 py-1 rounded-lg border border-red-500/50 bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-300 text-[11px] font-bold flex items-center gap-1 shadow-xs transition active:scale-95 cursor-pointer"
              >
                <VolumeX className="w-3.5 h-3.5 text-red-500 shrink-0" aria-hidden="true" />
                <span>Stop <kbd className="font-mono text-[9px] opacity-75">(S)</kbd></span>
              </button>

              {/* Gemini API Key Toggle */}
              <button
                type="button"
                onClick={() => setShowKeyConfig((prev) => !prev)}
                title="Configure Gemini API Key for 100% natural language accuracy"
                className={`px-2 py-1 rounded-lg border text-[11px] font-bold transition flex items-center gap-1 shadow-xs ${geminiVoiceService.hasApiKey()
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-theme-border bg-theme-bg/90 hover:bg-theme-bg text-theme-text'
                  }`}
              >
                <Key className="w-3 h-3" />
                <span>{geminiVoiceService.hasApiKey() ? 'Gemini 100%' : 'API Key'}</span>
              </button>

              <button
                type="button"
                onClick={cycleLanguage}
                title="Switch voice assistant language (English ↔ हिन्दी). Keyboard shortcut: L"
                aria-label={`Voice Assistant Language: ${langLabel}. Press Enter or press L to switch between English and Hindi.`}
                className="px-2 py-1 rounded-lg border border-theme-border bg-theme-bg/90 text-[11px] font-bold flex items-center gap-1.5 text-theme-text shadow-xs hover:border-theme-primary transition focus:ring-2 focus:ring-theme-focus-ring cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                <span>🌐 {langLabel}</span>
                <kbd className="text-[9px] px-1 py-0.5 rounded bg-theme-surface/80 border border-theme-border text-theme-muted font-mono" title="Shortcut key: L">L</kbd>
              </button>

              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                title="Minimize assistant window"
                aria-label="Minimize assistant window"
                className="p-1.5 rounded-lg border border-theme-border hover:bg-theme-bg text-theme-text/80 transition focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <Minimize2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Gemini API Key Inline Drawer */}
          {showKeyConfig && (
            <div className="p-3 bg-indigo-950/90 border-b border-indigo-500/40 text-xs space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  Google Gemini 2.0 Flash AI
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-amber-700 dark:text-yellow-400 hover:underline font-bold"
                  title="Get free API key directly from Google AI Studio"
                >
                  Get Free Key ↗
                </a>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  value={apiKeyVal}
                  onChange={(e) => {
                    setApiKeyVal(e.target.value);
                    setKeyValidationResult(null);
                  }}
                  placeholder="Paste Google AI Studio API Key..."
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-indigo-400/30 bg-black/50 text-white text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    geminiVoiceService.setApiKey(apiKeyVal);
                    setKeySaved(true);
                    soundEffects.playSelect();
                    setTimeout(() => setKeySaved(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                >
                  {keySaved ? 'Saved!' : 'Save'}
                </button>
                <button
                  type="button"
                  disabled={testingKey || !apiKeyVal.trim()}
                  onClick={async () => {
                    setTestingKey(true);
                    setKeyValidationResult(null);
                    const res = await geminiVoiceService.validateApiKey(apiKeyVal);
                    setKeyValidationResult(res);
                    setTestingKey(false);
                    if (res.ok) {
                      soundEffects.playSuccess();
                    } else {
                      soundEffects.playTimerAlert();
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-cyan-500/50 hover:bg-cyan-500/20 text-cyan-300 font-bold text-xs disabled:opacity-50"
                  title="Test whether your Gemini API key connects successfully"
                >
                  {testingKey ? 'Testing...' : 'Test Key'}
                </button>
                {geminiVoiceService.hasApiKey() && (
                  <button
                    type="button"
                    onClick={() => {
                      geminiVoiceService.setApiKey('');
                      setApiKeyVal('');
                      setKeyValidationResult(null);
                      soundEffects.playClear();
                    }}
                    className="px-2 py-1.5 rounded-lg border border-red-500/40 hover:bg-red-500/20 text-red-300 text-xs"
                    title="Remove API Key"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Key Validation Feedback */}
              {keyValidationResult && (
                <div
                  className={`p-2 rounded-lg text-[11px] leading-relaxed border ${keyValidationResult.ok
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-950/60 border-red-500/40 text-red-300'
                    }`}
                >
                  <p className="font-bold">
                    {keyValidationResult.ok ? '✅ Key Verified!' : '⚠️ Connection Issue:'}
                  </p>
                  <p className="text-[10px] mt-0.5 opacity-90">{keyValidationResult.message}</p>
                </div>
              )}

              <p className="text-[10px] text-indigo-300/80 leading-relaxed">
                💡 <span className="font-semibold text-white">100% Voice Accuracy:</span> Even without an API key, DristiX's built-in voice engine listens to Hindi & English and speaks answers aloud with zero latency!
              </p>
            </div>
          )}

          {/* Gemini Live Active Waveform Bar (When Voice AI is listening) */}
          {isGeminiLiveActive && (
            <div className="px-4 py-3 bg-gradient-to-r from-indigo-950 via-purple-950 to-blue-950 border-b border-indigo-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                {/* 5-bar live equalizer animating with real microphone volume */}
                <div className="flex items-center gap-1 h-5 shrink-0">
                  {[0.4, 0.8, 1.0, 0.7, 0.5].map((factor, idx) => {
                    const barHeight = Math.max(4, Math.min(22, (liveVolume * factor * 0.4)));
                    return (
                      <span
                        key={idx}
                        style={{ height: `${barHeight}px` }}
                        className={`w-1 rounded-full transition-all duration-75 ${liveState === 'user_speaking'
                          ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                          : liveState === 'assistant_speaking'
                            ? 'bg-purple-400 shadow-sm shadow-purple-400'
                            : liveState === 'processing'
                              ? 'bg-yellow-400 animate-pulse'
                              : 'bg-cyan-400/60'
                          }`}
                      />
                    );
                  })}
                </div>

                <div className="text-xs font-bold leading-tight truncate">
                  {liveState === 'user_speaking' && (
                    <span className="text-emerald-300 animate-pulse flex items-center gap-1 truncate">
                      <span>{interimTranscript ? `"${interimTranscript}"` : 'Sun raha hoon (Hearing you)...'}</span>
                    </span>
                  )}
                  {liveState === 'listening' && (
                    <span className="text-cyan-300">
                      Boliye (Speak now in Hindi or English)...
                    </span>
                  )}
                  {liveState === 'processing' && (
                    <span className="text-yellow-300 animate-pulse">
                      Processing command...
                    </span>
                  )}
                  {liveState === 'assistant_speaking' && (
                    <span className="text-purple-300 flex items-center gap-1">
                      <Volume2 className="w-3.5 h-3.5 animate-bounce shrink-0" />
                      <span className="truncate">Assistant bol raha hai (Speaking)...</span>
                    </span>
                  )}
                  {liveState === 'error' && (
                    <span className="text-red-300 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {liveError ?? 'Microphone unavailable. Use the text box below instead.'}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Instant Commit / Send Utterance Button */}
              {liveState === 'user_speaking' && (
                <button
                  type="button"
                  onClick={() => liveSessionRef.current?.commitCurrentUtterance()}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition shadow-sm animate-bounce"
                >
                  Send Now →
                </button>
              )}

              {/* Stop Speaking button when assistant is talking */}
              {(liveState === 'assistant_speaking' || speechEngine.isSpeaking()) && (
                <button
                  type="button"
                  onClick={() => {
                    useAnnouncerStore.getState().stopSpeech();
                    liveSessionRef.current?.interruptSpeaking();
                    soundEffects.playSelect();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold transition flex items-center gap-1 shadow-sm cursor-pointer shrink-0 animate-pulse"
                  title="Stop speaking (Shortcut: S or Esc)"
                  aria-label="Stop assistant speaking"
                >
                  <VolumeX className="w-3.5 h-3.5 shrink-0" />
                  <span>Stop (S)</span>
                </button>
              )}
            </div>
          )}

          {/* Messages & Live Transcript Scroll Area */}
          <div
            tabIndex={0}
            role="log"
            aria-live="polite"
            className="p-3.5 flex-1 overflow-y-auto space-y-3 max-h-[360px] bg-theme-bg/50 focus:outline-none"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'assistant' && (
                  <span
                    className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    <Bot className="w-3.5 h-3.5" />
                  </span>
                )}

                <div
                  className={`max-w-[82%] p-2.5 rounded-2xl text-xs leading-relaxed ${m.sender === 'user'
                    ? 'bg-theme-primary text-theme-primary-text rounded-tr-xs font-medium shadow-sm'
                    : 'bg-theme-surface border border-theme-border text-theme-text rounded-tl-xs shadow-sm'
                    }`}
                >
                  <p>{m.text}</p>
                  {m.action && (
                    <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-bold text-[10px]">
                      <span>⚡</span> {m.action}
                    </span>
                  )}
                </div>

                {m.sender === 'user' && (
                  <span
                    className="w-6 h-6 rounded-full bg-theme-primary/30 text-theme-text flex items-center justify-center text-xs shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    <User className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            ))}

            {/* Live Interim Transcript Bubble */}
            {interimTranscript && (
              <div className="flex gap-2 justify-end animate-pulse">
                <div className="max-w-[80%] p-2 rounded-xl bg-theme-primary/40 text-theme-text text-xs italic border border-theme-primary/50">
                  <span className="text-[10px] text-amber-800 dark:text-yellow-300 block font-bold">Listening...</span>
                  "{interimTranscript}"
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion Chips */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Voice command suggestion chips"
            className="px-3 py-2 border-t border-theme-border bg-theme-surface flex items-center gap-1.5 overflow-x-auto text-[11px] no-scrollbar focus:outline-none"
          >
            <span className="text-theme-text/50 font-bold shrink-0">Try:</span>
            {suggestionChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleExecuteQuery(chip)}
                className="px-2.5 py-1 rounded-full border border-theme-border bg-theme-bg hover:border-yellow-400 text-theme-text whitespace-nowrap transition shrink-0 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Typing Input & Mic Bar */}
          <form
            onSubmit={handleTypedSubmit}
            className="p-2.5 border-t-2 border-theme-border bg-theme-bg flex items-center gap-2"
          >
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              onKeyDown={(e) => {
                const isStopKey =
                  (
                    (e.key && (e.key.toLowerCase() === 's' || e.key === 'े' || e.key === 'स' || e.key === 'ए')) ||
                    e.code === 'KeyS' ||
                    e.keyCode === 83 ||
                    e.which === 83
                  ) &&
                  !e.altKey &&
                  !e.ctrlKey &&
                  !e.metaKey;

                const isToggleVoiceKey =
                  (
                    (e.key && (e.key.toLowerCase() === 'v' || e.key === 'ल' || e.key === 'न')) ||
                    e.code === 'KeyV' ||
                    e.keyCode === 86 ||
                    e.which === 86 ||
                    (e.altKey && (e.key?.toLowerCase() === 'v' || e.code === 'KeyV' || e.key === 'ल' || e.key === 'न'))
                  ) &&
                  !e.ctrlKey &&
                  !e.metaKey;

                const isLangKey =
                  (
                    (e.key && (e.key.toLowerCase() === 'l' || e.key === 'त' || e.key === 'ल')) ||
                    e.code === 'KeyL' ||
                    e.keyCode === 76 ||
                    e.which === 76
                  ) &&
                  !e.ctrlKey &&
                  !e.metaKey;

                const isVocalizing =
                  liveState === 'assistant_speaking' ||
                  speechEngine.isSpeaking() ||
                  voiceRecognition.getState() === 'speaking';

                const isStudentPortal =
                  Boolean(useAuthStore.getState().currentStudent) &&
                  !(typeof window !== 'undefined' && window.location.pathname.startsWith('/admin'));

                if ((isStopKey && isStudentPortal || e.key === 'Escape') && isVocalizing) {
                  e.preventDefault();
                  e.stopPropagation();
                  useAnnouncerStore.getState().stopSpeech();
                  liveSessionRef.current?.interruptSpeaking();
                  soundEffects.playSelect();
                  return;
                }

                if (isToggleVoiceKey && (!typedInput.trim() || e.altKey)) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleMic();
                  return;
                }

                // If user presses Alt+L or presses L while input is empty, cycle voice language
                if (e.altKey && isLangKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  cycleLanguage();
                  return;
                }

                if (isLangKey && !typedInput.trim()) {
                  e.preventDefault();
                  e.stopPropagation();
                  cycleLanguage();
                  return;
                }
              }}
              placeholder="Ask anything or speak in Hindi/English..."
              className="flex-1 px-3 py-2 rounded-xl border border-theme-border bg-theme-surface text-theme-text text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button
              type="submit"
              disabled={!typedInput.trim()}
              title="Send text query"
              aria-label="Send typed query"
              className="p-2 rounded-xl border border-theme-border bg-theme-primary text-theme-primary-text hover:bg-theme-primary-hover disabled:opacity-40 transition focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Gemini-style Glowing Voice Orb Button */}
      <div className="flex items-center gap-2">
        {/* Quick status pill when listening */}
        {isAnyListening && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/80 border-2 border-emerald-500 text-emerald-300 text-xs font-bold shadow-lg">
            <Activity className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            <span>
              {liveState === 'user_speaking'
                ? 'Hearing your voice...'
                : liveState === 'processing'
                  ? 'Gemini Thinking...'
                  : liveState === 'assistant_speaking'
                    ? 'Assistant Speaking...'
                    : 'Listening... Speak now'}
            </span>
          </div>
        )}

        <button
          id="btn-voice-assistant"
          type="button"
          onClick={handleToggleMic}
          style={{
            transform: isGeminiLiveActive ? `scale(${1 + Math.min(0.2, liveVolume / 300)})` : undefined,
          }}
          title={isAnyListening ? 'Stop Listening (Shortcut: V)' : 'Start Gemini Live AI Voice (Shortcut: V)'}
          aria-label={
            isAnyListening
              ? 'Voice Assistant is listening. Click or press V to stop.'
              : 'Start AI Conversational Voice Assistant. Click or press V to talk.'
          }
          className={`relative group w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-150 shadow-2xl focus:outline-none focus:ring-4 focus:ring-yellow-400 ${isAnyListening
            ? liveState === 'user_speaking'
              ? 'bg-gradient-to-tr from-emerald-500 via-teal-400 to-green-500 ring-4 ring-emerald-300 shadow-emerald-500/50'
              : liveState === 'assistant_speaking'
                ? 'bg-gradient-to-tr from-purple-600 via-teal-600 to-emerald-500 ring-4 ring-purple-400 shadow-purple-500/50'
                : 'bg-gradient-to-tr from-teal-500 via-emerald-500 to-teal-600 ring-4 ring-teal-400/60'
            : 'bg-gradient-to-tr from-teal-700 via-emerald-600 to-teal-800 hover:scale-105 hover:shadow-teal-500/50'
            }`}
        >
          {/* Animated soundwave ring when listening */}
          {isAnyListening && (
            <span
              className="absolute inset-0 rounded-full border-4 border-teal-400 animate-ping opacity-60 pointer-events-none"
              aria-hidden="true"
            />
          )}

          {/* Microphone Icon */}
          <div className="text-white relative z-10 flex flex-col items-center justify-center" aria-hidden="true">
            {isAnyListening ? (
              <Mic className="w-7 h-7 text-white drop-shadow-md animate-bounce" aria-hidden="true" />
            ) : (
              <Mic className="w-6 h-6 sm:w-7 sm:h-7 text-white drop-shadow-md" aria-hidden="true" />
            )}
            <span className="text-[10px] font-black uppercase tracking-wider text-white mt-0.5">
              V
            </span>
          </div>
        </button>
      </div>
    </aside>
  );
};
