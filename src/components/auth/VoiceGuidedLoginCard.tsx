import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { voiceRecognition, type VoiceState } from '../../utils/voiceRecognition';
import { speechEngine } from '../../utils/speechEngine';
import { soundEffects } from '../../utils/soundEffects';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { isHindiPreferred } from '../../utils/voiceRecognition';
import {
  extractSpokenGmail,
  extractRollOrEmail,
  extractPassword,
  parseOneShotLogin,
} from '../../utils/voiceAuthParser';
import { audioNoiseFilter, type AudioNoiseStats } from '../../utils/audioNoiseFilter';

export type GuidedStage =
  | 'idle'
  | 'awaiting_identifier'
  | 'awaiting_password'
  | 'authenticating';

interface VoiceGuidedLoginCardProps {
  loginIdentifier: string;
  setLoginIdentifier: (val: string) => void;
  loginPassword: string;
  setLoginPassword: (val: string) => void;
  onLogin: (identifier?: string, pass?: string) => Promise<boolean>;
  isSubmitting: boolean;
  errorMessage?: string;
}

export const VoiceGuidedLoginCard: React.FC<VoiceGuidedLoginCardProps> = ({
  loginIdentifier,
  setLoginIdentifier,
  loginPassword,
  setLoginPassword,
  onLogin,
  isSubmitting,
  errorMessage,
}) => {
  const isHindi = isHindiPreferred();
  const [stage, setStage] = useState<GuidedStage>('idle');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [lastHeard, setLastHeard] = useState<string>('');
  const [assistantPrompt, setAssistantPrompt] = useState<string>('');
  const [micPermissionDenied, setMicPermissionDenied] = useState<boolean>(false);
  const [isSpeakingPrompt, setIsSpeakingPrompt] = useState<boolean>(false);

  // Real-time audio noise filtering telemetry
  const [audioStats, setAudioStats] = useState<AudioNoiseStats>({
    volume: 0,
    isSpeech: false,
    noiseFloor: 0.015,
    isHardwareFiltered: true,
  });

  const stageRef = useRef<GuidedStage>(stage);
  stageRef.current = stage;

  const isActiveRef = useRef<boolean>(isActive);
  isActiveRef.current = isActive;

  const loginIdRef = useRef<string>(loginIdentifier);
  loginIdRef.current = loginIdentifier;

  const loginPassRef = useRef<string>(loginPassword);
  loginPassRef.current = loginPassword;

  const isSubmittingRef = useRef<boolean>(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  const hasGreetedRef = useRef<boolean>(false);
  const lastPromptTimeRef = useRef<number>(0);

  // Initialize hardware noise cancellation and live audio filtering pipeline
  useEffect(() => {
    void audioNoiseFilter.start().then((started) => {
      if (!started && typeof navigator !== 'undefined' && navigator.permissions?.query) {
        navigator.permissions
          .query({ name: 'microphone' as PermissionName })
          .then((perm) => {
            if (perm.state === 'denied') setMicPermissionDenied(true);
          })
          .catch(() => {});
      }
    });

    const unsubNoise = audioNoiseFilter.addListener((stats) => {
      setAudioStats(stats);
    });

    return () => {
      unsubNoise();
      audioNoiseFilter.stop();
    };
  }, []);

  // Monitor microphone permission state
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((perm) => {
          if (perm.state === 'denied') {
            setMicPermissionDenied(true);
          }
          perm.onchange = () => {
            if (perm.state === 'granted') {
              setMicPermissionDenied(false);
              void audioNoiseFilter.start();
              voiceRecognition.start();
            } else if (perm.state === 'denied') {
              setMicPermissionDenied(true);
            }
          };
        })
        .catch(() => {});
    }
  }, []);

  /**
   * Speaks guidance message aloud through SpeechEngine and live region.
   * Enforces strict echo isolation so microphone never captures assistant's own voice.
   */
  const speakGuidance = useCallback((text: string, interrupt = true) => {
    setAssistantPrompt(text);
    setIsSpeakingPrompt(true);
    lastPromptTimeRef.current = Date.now();

    useAnnouncerStore.getState().announce(text, 'assertive', true, interrupt);
  }, []);

  /**
   * Initial & primary prompt: Ask student for Google Mail and Password.
   */
  const promptForCredentials = useCallback(() => {
    setStage('awaiting_identifier');
    const msg = isHindi
      ? 'दृष्टि-एक्स में आपका स्वागत है। कृपया अपना पंजीकृत गूगल ईमेल (@gmail.com) और पासवर्ड बोलें।'
      : 'Welcome to DristiX. Please speak your registered Google Mail address and password to sign in.';
    speakGuidance(msg);
  }, [isHindi, speakGuidance]);

  /**
   * Step 2: Confirm Google Mail and prompt specifically for Password.
   */
  const promptForPassword = useCallback((identifierValue: string) => {
    setStage('awaiting_password');
    const msg = isHindi
      ? `गूगल ईमेल ${identifierValue} दर्ज किया गया है। अब अपना पासवर्ड बोलें।`
      : `Google Mail ${identifierValue} confirmed. Now please speak your password.`;
    speakGuidance(msg);
  }, [isHindi, speakGuidance]);

  /**
   * Step 3: Automatically submit and log in once credentials are collected.
   */
  const executeSubmit = useCallback(
    async (customId?: string, customPass?: string, wasOneShot = false) => {
      const idToUse = customId ?? loginIdRef.current;
      const passToUse = customPass ?? loginPassRef.current;

      if (!idToUse) {
        promptForCredentials();
        return;
      }
      if (!passToUse) {
        promptForPassword(idToUse);
        return;
      }

      if (isSubmittingRef.current) return;
      setStage('authenticating');
      soundEffects.playSelect();

      const verifyingMsg = isHindi
        ? wasOneShot
          ? `गूगल ईमेल ${idToUse} और पासवर्ड दर्ज कर लिया गया है, लॉगिन किया जा रहा है...`
          : 'पासवर्ड दर्ज किया गया है, लॉगिन किया जा रहा है...'
        : wasOneShot
        ? `Google Mail ${idToUse} and password confirmed, logging in...`
        : 'Password confirmed, logging in...';
      speakGuidance(verifyingMsg, false);

      const success = await onLogin(idToUse, passToUse);
      if (!success) {
        // Keep Google Mail intact, clear password, and prompt to re-speak password
        setStage('awaiting_password');
        setLoginPassword('');
        const failMsg = isHindi
          ? 'लॉगिन विवरण अमान्य हैं। कृपया अपना पासवर्ड फिर से बोलें।'
          : 'Invalid credentials. Please verify your details or speak your password again.';
        speakGuidance(failMsg);
      }
    },
    [isHindi, onLogin, promptForCredentials, promptForPassword, setLoginPassword, speakGuidance]
  );

  const hasUserActivatedAudioRef = useRef<boolean>(false);

  const activateVoiceSystem = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}
    }

    setIsActive(true);
    void audioNoiseFilter.start();
    try {
      voiceRecognition.start();
    } catch {}

    if (!hasUserActivatedAudioRef.current) {
      hasUserActivatedAudioRef.current = true;
      soundEffects.playMicStart();
      if (!loginIdRef.current) {
        promptForCredentials();
      } else {
        promptForPassword(loginIdRef.current);
      }
    }
  }, [promptForCredentials, promptForPassword]);

  // Immediately listen for any user keypress or click to unlock audio under browser autoplay policy
  useEffect(() => {
    const handleFirstInteraction = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') return;
      activateVoiceSystem();
    };

    window.addEventListener('keydown', handleFirstInteraction, { passive: true });
    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('click', handleFirstInteraction, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('click', handleFirstInteraction);
    };
  }, [activateVoiceSystem]);

  // Initial greeting upon mounting the login screen & immediate mic start
  useEffect(() => {
    if (isActive) {
      try {
        voiceRecognition.start();
      } catch {}
    }

    if (!hasGreetedRef.current && isActive) {
      hasGreetedRef.current = true;
      const timer = setTimeout(() => {
        promptForCredentials();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isActive, promptForCredentials]);

  // Synchronize TTS speech lifecycle with voice recognition listening gate
  useEffect(() => {
    const unsubStart = speechEngine.onSpeechStart(() => {
      setIsSpeakingPrompt(true);
    });

    const unsubEnd = speechEngine.onSpeechEnd(() => {
      // 300ms acoustic grace period to allow room speaker reverb to subside
      setTimeout(() => {
        setIsSpeakingPrompt(false);
        if (isActiveRef.current && voiceRecognition.getState() !== 'listening') {
          try {
            voiceRecognition.start();
          } catch {}
        }
      }, 300);
    });

    // Safety watchdog: ensure isSpeakingPrompt never gets permanently stuck
    const safetyTimer = setInterval(() => {
      if (!speechEngine.isSpeaking()) {
        setIsSpeakingPrompt(false);
      }
    }, 800);

    return () => {
      unsubStart();
      unsubEnd();
      clearInterval(safetyTimer);
    };
  }, []);

  // Process speech transcripts with noise filtering and spoken Gmail parser
  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean, alternatives?: string[]) => {
      if (!isActiveRef.current) return;

      const trimmed = transcript.trim();
      if (!trimmed) return;

      const isCreds =
        /@|gmail|googlemail|email|mail|dot\s*com|एट|जीमेल|ईमेल|डाट\s*काम|password|passcode|pass|pin|पिन|पासवर्ड|पासकोड|student\d+|dx-\d+/i.test(trimmed) ||
        Boolean(alternatives?.some((alt) => /@|gmail|googlemail|email|mail|dot\s*com|एट|जीमेल|ईमेल|डाट\s*काम|password|passcode|pass|pin|पिन|पासवर्ड|पासकोड|student\d+|dx-\d+/i.test(alt)));

      // ECHO SUPPRESSION: Discard transcript if assistant is vocalizing or just finished, UNLESS it's explicit credentials
      if (!isCreds && (speechEngine.isSpeaking() || isSpeakingPrompt || Date.now() - lastPromptTimeRef.current < 400)) {
        return;
      }

      // Provide real-time visual feedback on what the mic is capturing
      setLastHeard(trimmed);

      // Wait until utterance is final to parse multi-word phrases cleanly
      if (!isFinal) return;

      const lower = trimmed.toLowerCase();

      // Reset / Clear command
      if (
        lower.includes('ईमेल बदलो') ||
        lower.includes('रोल नंबर बदलो') ||
        lower.includes('change email') ||
        lower.includes('reset email') ||
        lower.includes('clear email') ||
        lower.includes('clear credentials') ||
        lower.includes('start again') ||
        lower.includes('दोबारा बोलो')
      ) {
        if (speechEngine.isSpeaking()) speechEngine.stop();
        setLoginIdentifier('');
        setLoginPassword('');
        soundEffects.playNavigate();
        promptForCredentials();
        return;
      }

      // Build candidate list (primary utterance + speech alternatives)
      const candidateUtterances = [
        trimmed,
        ...(alternatives || []).map((a) => a.trim()).filter((a) => a && a !== trimmed),
      ];

      // 1. One-shot command check: Did candidate speak BOTH Google Mail and Password?
      // E.g.: "my email is rahul123 at gmail dot com and password is student123"
      let fullOneShot: ReturnType<typeof parseOneShotLogin> = null;
      for (const cand of candidateUtterances) {
        const parsed = parseOneShotLogin(cand);
        if (parsed && (parsed.rollNumber || extractSpokenGmail(cand)) && parsed.password) {
          const email = extractSpokenGmail(cand) || parsed.rollNumber;
          fullOneShot = {
            rollNumber: email,
            password: parsed.password,
            wantsSubmit: true,
          };
          break;
        }
      }

      if (fullOneShot && fullOneShot.rollNumber && fullOneShot.password) {
        if (speechEngine.isSpeaking()) speechEngine.stop();
        setLoginIdentifier(fullOneShot.rollNumber);
        setLoginPassword(fullOneShot.password);
        soundEffects.playSelect();

        void executeSubmit(fullOneShot.rollNumber, fullOneShot.password, true);
        return;
      }

      // 2. Step 1: Check if utterance contains Google Mail address
      let extractedEmail = '';
      for (const cand of candidateUtterances) {
        const gmail = extractSpokenGmail(cand);
        if (gmail) {
          extractedEmail = gmail;
          break;
        }
        const generalId = extractRollOrEmail(cand);
        if (generalId && (generalId.includes('@') || generalId.startsWith('DX-'))) {
          extractedEmail = generalId;
          break;
        }
      }

      if (
        extractedEmail &&
        (stageRef.current === 'awaiting_identifier' || stageRef.current === 'idle' || !loginIdRef.current)
      ) {
        if (speechEngine.isSpeaking()) speechEngine.stop();
        setLoginIdentifier(extractedEmail);
        soundEffects.playSelect();
        promptForPassword(extractedEmail);
        return;
      }

      // 3. Step 2: Awaiting Password (or re-speaking password after email was confirmed)
      if (stageRef.current === 'awaiting_password' || loginIdRef.current) {
        let extractedPass = '';
        for (const cand of candidateUtterances) {
          const parsed = parseOneShotLogin(cand);
          if (parsed?.password) {
            extractedPass = parsed.password;
            break;
          }
          const rawPass = extractPassword(cand);
          if (rawPass && rawPass.length >= 3) {
            extractedPass = rawPass;
            break;
          }
        }

        if (extractedPass && extractedPass.length >= 3) {
          if (speechEngine.isSpeaking()) speechEngine.stop();
          setLoginPassword(extractedPass);
          soundEffects.playSelect();
          void executeSubmit(loginIdRef.current, extractedPass, false);
          return;
        }
      }
    },
    [
      executeSubmit,
      isSpeakingPrompt,
      promptForCredentials,
      promptForPassword,
      setLoginIdentifier,
      setLoginPassword,
    ]
  );

  // Subscribe to voice recognition
  useEffect(() => {
    const unsubscribe = voiceRecognition.addListener({
      onTranscript: (transcript: string, isFinal: boolean, alternatives?: string[]) => {
        handleTranscript(transcript, isFinal, alternatives);
      },
      onStateChange: (state: VoiceState) => {
        setVoiceState(state);
      },
      onError: (err: string) => {
        console.warn('[VoiceGuidedLoginCard] Recognition error:', err);
        if (
          err.toLowerCase().includes('denied') ||
          err.toLowerCase().includes('not-allowed') ||
          err.toLowerCase().includes('permission')
        ) {
          setMicPermissionDenied(true);
        }
      },
    });

    return () => {
      unsubscribe();
    };
  }, [handleTranscript]);

  // Watchdog: Ensure recognition remains healthy and listening when active
  useEffect(() => {
    if (!isActive) return;

    const watchdog = setInterval(() => {
      if (
        isActiveRef.current &&
        !speechEngine.isSpeaking() &&
        !isSubmittingRef.current &&
        voiceRecognition.getState() !== 'listening' &&
        voiceRecognition.getState() !== 'speaking'
      ) {
        try {
          voiceRecognition.start();
        } catch {}
      }
    }, 2500);

    return () => clearInterval(watchdog);
  }, [isActive]);

  const handleRequestMic = async () => {
    try {
      const started = await audioNoiseFilter.start();
      if (started) {
        setMicPermissionDenied(false);
        setIsActive(true);
        voiceRecognition.start();
        soundEffects.playSelect();
        if (!loginIdentifier) {
          promptForCredentials();
        } else {
          promptForPassword(loginIdentifier);
        }
      } else {
        setMicPermissionDenied(true);
      }
    } catch {
      setMicPermissionDenied(true);
    }
  };

  const toggleVoiceGuidance = () => {
    if (isActive) {
      setIsActive(false);
      voiceRecognition.stop();
      speechEngine.stop();
      audioNoiseFilter.stop();
      useAnnouncerStore
        .getState()
        .announce(
          isHindi ? 'वॉयस सहायता बंद की गई।' : 'Voice assistance paused.',
          'polite',
          true
        );
    } else {
      setIsActive(true);
      void audioNoiseFilter.start();
      voiceRecognition.start();
      if (!loginIdentifier) {
        promptForCredentials();
      } else {
        promptForPassword(loginIdentifier);
      }
    }
    soundEffects.playSelect();
  };

  const handleReplayPrompt = () => {
    soundEffects.playSelect();
    if (stage === 'awaiting_identifier' || !loginIdentifier) {
      promptForCredentials();
    } else {
      promptForPassword(loginIdentifier);
    }
  };

  const handleResetCredentials = () => {
    soundEffects.playSelect();
    setLoginIdentifier('');
    setLoginPassword('');
    setLastHeard('');
    promptForCredentials();
  };

  return (
    <div
      role="region"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          activateVoiceSystem();
        }
      }}
      onClick={() => activateVoiceSystem()}
      aria-label={isHindi ? 'वॉयस गाइडेड लॉगिन (चालू करने के लिए Enter या V दबाएं)' : 'Voice Guided Login (Press Enter or V to activate microphone and guidance)'}
      className="mb-5 p-4 rounded-2xl border-2 border-teal-500/30 bg-teal-500/5 dark:bg-teal-950/20 shadow-md relative overflow-hidden backdrop-blur-xs transition-all space-y-3 cursor-pointer focus:ring-4 focus:ring-teal-500/40 outline-none"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              isSubmitting
                ? 'bg-amber-500 text-white animate-spin'
                : isSpeakingPrompt || speechEngine.isSpeaking()
                ? 'bg-indigo-600 text-white animate-pulse'
                : isActive && voiceState === 'listening'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400/50'
                : isActive
                ? 'bg-teal-600 text-white'
                : 'bg-theme-surface text-theme-text/40 border border-theme-border'
            }`}
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5" aria-hidden="true" />
            ) : isSpeakingPrompt || speechEngine.isSpeaking() ? (
              <Volume2 className="w-5 h-5" aria-hidden="true" />
            ) : isActive ? (
              <Mic className="w-5 h-5" aria-hidden="true" />
            ) : (
              <MicOff className="w-5 h-5" aria-hidden="true" />
            )}
          </div>

          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-theme-text flex items-center gap-2">
              <span>{isHindi ? 'वॉयस गाइडेड लॉगिन' : 'Voice Guided Login'}</span>
              {isActive && (
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              )}
            </h2>
            <p className="text-xs text-theme-text-secondary mt-0.5">
              {isSubmitting
                ? isHindi
                  ? 'सत्यापित किया जा रहा है...'
                  : 'Verifying Google credentials...'
                : isSpeakingPrompt || speechEngine.isSpeaking()
                ? isHindi
                  ? 'असिस्टेंट बोल रहा है... (माइक सुरक्षित रूप से शांत है)'
                  : 'Assistant speaking instructions... (Mic muted for clarity)'
                : isActive
                ? isHindi
                  ? 'असिस्टेंट शोर रद्द करके सीधे आपका ईमेल व पासवर्ड सुन रहा है'
                  : 'Assistant is listening with AI noise cancellation'
                : isHindi
                ? 'वॉयस सहायता रुकी हुई है'
                : 'Voice guidance paused'}
            </p>
          </div>
        </div>

        {/* Minimal Controls */}
        <div className="flex items-center gap-2">
          {loginIdentifier && (
            <button
              type="button"
              onClick={handleResetCredentials}
              title={isHindi ? 'ईमेल दोबारा बोलें' : 'Clear & Re-speak'}
              className="p-2 rounded-xl text-theme-text/70 hover:text-theme-text hover:bg-theme-surface border border-theme-border/60 transition cursor-pointer"
              aria-label={isHindi ? 'ईमेल दोबारा बोलें' : 'Clear & Re-speak'}
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={handleReplayPrompt}
            title={isHindi ? 'निर्देश दोबारा सुनें' : 'Replay instructions'}
            className="p-2 rounded-xl text-theme-text/70 hover:text-theme-text hover:bg-theme-surface border border-theme-border/60 transition cursor-pointer"
            aria-label={isHindi ? 'निर्देश दोबारा सुनें' : 'Replay instructions'}
          >
            <Volume2 className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={toggleVoiceGuidance}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              isActive
                ? 'bg-theme-surface border-theme-border hover:bg-theme-bg text-theme-text'
                : 'bg-teal-600 text-white border-teal-600 shadow-sm'
            }`}
          >
            {isActive ? (
              <>
                <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isHindi ? 'म्यूट' : 'Mute'}</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isHindi ? 'चालू करें' : 'Start'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Noise Cancellation & Live Voice Activity Bar */}
      {isActive && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-theme-surface/70 border border-theme-border/60 text-[11px] text-theme-text/80">
          <div className="flex items-center gap-1.5 font-bold text-teal-700 dark:text-teal-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
            <span>AI Noise Cancellation Active</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-theme-text/60">
              {audioStats.isSpeech ? 'Voice Detected' : 'Filtering Ambient Sound'}
            </span>
            {/* Live 5-bar acoustic energy visualizer */}
            <div className="flex items-end gap-0.5 h-3 w-8" aria-hidden="true">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((threshold, idx) => {
                const isLit = audioStats.volume >= threshold;
                return (
                  <span
                    key={idx}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      isLit
                        ? 'bg-emerald-500 h-full'
                        : audioStats.isSpeech
                        ? 'bg-emerald-300/40 h-1.5'
                        : 'bg-theme-border/60 h-1'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Assistant Voice Prompt Callout */}
      <div
        className={`p-3.5 rounded-xl border text-xs sm:text-sm flex flex-col gap-2 transition-colors ${
          errorMessage
            ? 'bg-red-500/10 border-red-500/40 text-red-600 dark:text-red-400'
            : 'bg-theme-surface border-theme-border text-theme-text'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold leading-snug">
              {errorMessage
                ? `⚠️ ${errorMessage}`
                : assistantPrompt ||
                  (isHindi
                    ? 'अपना गूगल ईमेल (@gmail.com) और पासवर्ड बोलें...'
                    : 'Speak your Google Mail (@gmail.com) and password...')}
            </p>
            {lastHeard && !errorMessage && (
              <p className="text-[11px] text-theme-text-secondary mt-1 font-mono">
                {isHindi ? 'सुना गया:' : 'Heard:'}{' '}
                <span className="text-teal-600 dark:text-teal-400 font-bold">"{lastHeard}"</span>
              </p>
            )}
          </div>
        </div>

        {/* Status badges when credentials are captured */}
        {(loginIdentifier || loginPassword) && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-theme-border/50 text-xs">
            {loginIdentifier && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold font-mono">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Gmail: {loginIdentifier}
              </span>
            )}
            {loginPassword && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold font-mono">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Password: ••••••••
              </span>
            )}
          </div>
        )}
      </div>

      {/* Microphone Permission Blocked Banner */}
      {micPermissionDenied && (
        <div className="p-3 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2">
            <MicOff className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">
                {isHindi
                  ? 'माइक की अनुमति (Permission) बंद (Blocked) है'
                  : 'Microphone permission is blocked'}
              </p>
              <p className="text-xs opacity-90 mt-0.5">
                {isHindi
                  ? 'ब्राउज़र के Address Bar में 🔒 या 🎙️ आइकन पर क्लिक करके Microphone को "Allow" करें।'
                  : 'Click the 🔒 or 🎙️ icon in your browser address bar and choose "Allow" for Microphone.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestMic}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs whitespace-nowrap self-start sm:self-auto transition shadow-xs cursor-pointer"
          >
            {isHindi ? 'अनुमति दें (Allow Mic)' : 'Allow Microphone'}
          </button>
        </div>
      )}
    </div>
  );
};
