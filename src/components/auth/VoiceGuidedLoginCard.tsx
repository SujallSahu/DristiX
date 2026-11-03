import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { voiceRecognition, type VoiceState } from '../../utils/voiceRecognition';
import { speechEngine } from '../../utils/speechEngine';
import { soundEffects } from '../../utils/soundEffects';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { isHindiPreferred } from '../../utils/voiceRecognition';
import {
  extractRollOrEmail,
  extractPassword,
  parseOneShotLogin,
} from '../../utils/voiceAuthParser';

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
              voiceRecognition.start();
            } else if (perm.state === 'denied') {
              setMicPermissionDenied(true);
            }
          };
        })
        .catch(() => {});
    }
  }, []);

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

  /**
   * Speaks guidance message aloud through SpeechEngine and live region.
   */
  const speakGuidance = useCallback((text: string, interrupt = true) => {
    setAssistantPrompt(text);
    useAnnouncerStore.getState().announce(text, 'assertive', true, interrupt);
  }, []);

  /**
   * Initial & primary prompt: Ask student for Roll Number or Email, and Password.
   * Clarifies that both can be spoken together or one by one.
   */
  const promptForCredentials = useCallback(() => {
    setStage('awaiting_identifier');
    const msg = isHindi
      ? 'दृष्टि-एक्स में आपका स्वागत है। कृपया अपना पंजीकृत गूगल ईमेल (@gmail.com) और पासवर्ड बोलें।'
      : 'Welcome to DristiX. Please speak your registered Google Mail address and password to sign in.';
    speakGuidance(msg);
  }, [isHindi, speakGuidance]);

  /**
   * Step 2: Confirm Roll Number and prompt specifically for Password when only roll was spoken.
   */
  const promptForPassword = useCallback((identifierValue: string) => {
    setStage('awaiting_password');
    const msg = isHindi
      ? `गूगल ईमेल ${identifierValue} दर्ज किया गया है। अब अपना पासवर्ड बोलें।`
      : `Google Mail ${identifierValue} entered. Now please speak your password.`;
    speakGuidance(msg);
  }, [isHindi, speakGuidance]);

  /**
   * Step 3: Automatically submit and log in once credentials are collected.
   */
  const executeSubmit = useCallback(async (customId?: string, customPass?: string, wasOneShot = false) => {
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
      ? `Google Mail ${idToUse} and password entered, logging in...`
      : 'Password entered, logging in...';
    speakGuidance(verifyingMsg, false);

    const success = await onLogin(idToUse, passToUse);
    if (!success) {
      // Keep roll number intact, clear only password, and prompt to re-speak password
      setStage('awaiting_password');
      setLoginPassword('');
      const failMsg = isHindi
        ? 'लॉगिन विवरण अमान्य हैं। कृपया अपना पासवर्ड फिर से बोलें।'
        : 'Invalid credentials. Please verify your details or speak your password again.';
      speakGuidance(failMsg);
    }
  }, [isHindi, onLogin, promptForCredentials, promptForPassword, setLoginPassword, speakGuidance]);

  // Initial greeting upon mounting the login screen
  useEffect(() => {
    if (!hasGreetedRef.current && isActive) {
      hasGreetedRef.current = true;
      const timer = setTimeout(() => {
        promptForCredentials();
        try {
          if (voiceRecognition.getState() !== 'listening') {
            voiceRecognition.start();
          }
        } catch (err) {
          console.warn('Auto-start voice recognition:', err);
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isActive, promptForCredentials]);

  // Ensure recognition is listening when assistant finishes any spoken prompt
  useEffect(() => {
    const unsub = speechEngine.onSpeechEnd(() => {
      if (isActiveRef.current && voiceRecognition.getState() !== 'listening') {
        try {
          voiceRecognition.start();
        } catch {}
      }
    });
    return () => unsub();
  }, []);

  // Process speech transcripts with high accuracy and alternative analysis
  const handleTranscript = useCallback((transcript: string, isFinal: boolean, alternatives?: string[]) => {
    if (!isActiveRef.current) return;

    const trimmed = transcript.trim();
    if (!trimmed) return;

    // Provide real-time visual feedback on interim transcripts
    setLastHeard(trimmed);

    // CRITICAL: NEVER advance stage or parse on partial/interim fragments!
    // Wait until candidate finishes their utterance (isFinal) so multi-word utterances
    // like "my roll no is 123 and my passwoard is 12345678" are evaluated whole.
    if (!isFinal) return;

    const lower = trimmed.toLowerCase();

    // Reset command
    if (
      lower.includes('रोल नंबर बदलो') ||
      lower.includes('change roll') ||
      lower.includes('reset roll') ||
      lower.includes('रोल नंबर फिर से') ||
      lower.includes('clear credentials') ||
      lower.includes('दोबारा बोलो')
    ) {
      if (speechEngine.isSpeaking()) speechEngine.stop();
      setLoginIdentifier('');
      setLoginPassword('');
      promptForCredentials();
      soundEffects.playNavigate();
      return;
    }

    // Build candidate list (primary utterance + speech alternatives) for maximum accuracy
    const candidateUtterances = [
      trimmed,
      ...(alternatives || []).map((a) => a.trim()).filter((a) => a && a !== trimmed),
    ];

    // 1. One-shot command check: Did user speak BOTH Roll Number/Email and Password?
    // E.g.: "my roll no is 123 and my passwoard is 12345678"
    let fullOneShot: ReturnType<typeof parseOneShotLogin> = null;
    for (const cand of candidateUtterances) {
      const parsed = parseOneShotLogin(cand);
      if (parsed && parsed.rollNumber && parsed.password) {
        fullOneShot = parsed;
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

    // 2. Check if utterance contains Roll Number / Identifier
    let extractedId = '';
    for (const cand of candidateUtterances) {
      const parsed = parseOneShotLogin(cand);
      if (parsed?.rollNumber) {
        extractedId = parsed.rollNumber;
        break;
      }
      const rawId = extractRollOrEmail(cand);
      if (rawId) {
        extractedId = rawId;
        break;
      }
    }

    const explicitlyStatedRoll =
      lower.includes('रोल नंबर') ||
      lower.includes('roll number') ||
      lower.includes('roll no') ||
      lower.includes('roll') ||
      lower.includes('my roll') ||
      lower.includes('id') ||
      lower.includes('email');

    if (
      extractedId &&
      (stageRef.current === 'awaiting_identifier' || stageRef.current === 'idle' || explicitlyStatedRoll)
    ) {
      if (speechEngine.isSpeaking()) speechEngine.stop();
      setLoginIdentifier(extractedId);
      soundEffects.playSelect();
      promptForPassword(extractedId);
      return;
    }

    // 3. Awaiting Password (or re-speaking password after roll was set)
    if (stageRef.current === 'awaiting_password' || loginIdRef.current) {
      let extractedPass = '';
      for (const cand of candidateUtterances) {
        const parsed = parseOneShotLogin(cand);
        if (parsed?.password) {
          extractedPass = parsed.password;
          break;
        }
        const rawPass = extractPassword(cand);
        if (rawPass && rawPass.length >= 2) {
          extractedPass = rawPass;
          break;
        }
      }

      if (extractedPass && extractedPass.length >= 2) {
        if (speechEngine.isSpeaking()) speechEngine.stop();
        setLoginPassword(extractedPass);
        soundEffects.playSelect();
        void executeSubmit(loginIdRef.current, extractedPass, false);
        return;
      }
    }
  }, [
    executeSubmit,
    promptForCredentials,
    promptForPassword,
    setLoginIdentifier,
    setLoginPassword,
  ]);

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
        console.warn('Guided voice recognition error:', err);
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

  const handleRequestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermissionDenied(false);
      setIsActive(true);
      voiceRecognition.start();
      soundEffects.playSelect();
      if (!loginIdentifier) {
        promptForCredentials();
      } else {
        promptForPassword(loginIdentifier);
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
      useAnnouncerStore
        .getState()
        .announce(
          isHindi ? 'वॉयस सहायता बंद की गई।' : 'Voice assistance paused.',
          'polite',
          true
        );
    } else {
      setIsActive(true);
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

  return (
    <div
      role="region"
      aria-label={isHindi ? 'वॉयस गाइडेड लॉगिन' : 'Voice Guided Login'}
      className="mb-5 p-4 rounded-2xl border-2 border-theme-primary/30 bg-theme-primary/5 shadow-md relative overflow-hidden backdrop-blur-xs transition-all"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              isSubmitting
                ? 'bg-amber-500 text-white animate-spin'
                : isActive && voiceState === 'listening'
                ? 'bg-emerald-600 text-white animate-pulse shadow-md shadow-emerald-500/30'
                : isActive
                ? 'bg-theme-primary text-theme-primary-text'
                : 'bg-theme-surface text-theme-text/40 border border-theme-border'
            }`}
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5" aria-hidden="true" />
            ) : isActive ? (
              <Mic className="w-5 h-5" aria-hidden="true" />
            ) : (
              <MicOff className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-theme-text flex items-center gap-2">
              <span>{isHindi ? 'वॉयस गाइडेड लॉगिन' : 'Voice Guided Login'}</span>
              {isActive && (
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              )}
            </h2>
            <p className="text-xs text-theme-text-secondary mt-0.5">
              {isSubmitting
                ? isHindi ? 'सत्यापित किया जा रहा है...' : 'Verifying credentials...'
                : isActive
                ? isHindi
                  ? 'असिस्टेंट सीधे सुनकर रोल नंबर व पासवर्ड दर्ज कर रहा है'
                  : 'Assistant is listening and entering your credentials'
                : isHindi
                ? 'वॉयस सहायता रुकी हुई है'
                : 'Voice guidance paused'}
            </p>
          </div>
        </div>

        {/* Minimal Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReplayPrompt}
            title={isHindi ? 'निर्देश दोबारा सुनें' : 'Replay instructions'}
            className="p-2 rounded-xl text-theme-text/70 hover:text-theme-text hover:bg-theme-surface border border-theme-border/60 transition focus:ring-2 focus:ring-theme-focus"
            aria-label={isHindi ? 'निर्देश दोबारा सुनें' : 'Replay instructions'}
          >
            <Volume2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleVoiceGuidance}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              isActive
                ? 'bg-theme-surface border-theme-border hover:bg-theme-bg text-theme-text'
                : 'bg-theme-primary text-theme-primary-text border-theme-primary'
            } focus:ring-2 focus:ring-theme-focus`}
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

      {/* Assistant Voice Prompt Callout */}
      <div
        className={`mt-3 p-3.5 rounded-xl border text-xs sm:text-sm flex flex-col gap-2 transition-colors ${
          errorMessage
            ? 'bg-red-500/10 border-red-500/40 text-red-600 dark:text-red-400'
            : 'bg-theme-surface border-theme-border text-theme-text'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-theme-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold leading-snug">
              {errorMessage
                ? `⚠️ ${errorMessage}`
                : assistantPrompt || (isHindi
                    ? 'अपना गूगल ईमेल (@gmail.com) और पासवर्ड बोलें...'
                    : 'Speak your Google Mail (@gmail.com) and password...')}
            </p>
            {lastHeard && !errorMessage && (
              <p className="text-[11px] text-theme-text-secondary mt-1 font-mono">
                {isHindi ? 'सुना गया:' : 'Heard:'} <span className="text-theme-primary font-bold">"{lastHeard}"</span>
              </p>
            )}
          </div>
        </div>

        {/* Status badges when credentials are captured */}
        {(loginIdentifier || loginPassword) && (
          <div className="flex items-center gap-2 pt-1 border-t border-theme-border/50 text-xs">
            {loginIdentifier && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                <CheckCircle2 className="w-3 h-3" />
                Gmail: {loginIdentifier}
              </span>
            )}
            {loginPassword && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                <CheckCircle2 className="w-3 h-3" />
                Password: ••••••••
              </span>
            )}
          </div>
        )}


      </div>

      {/* Microphone Permission Blocked Banner */}
      {micPermissionDenied && (
        <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
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
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs whitespace-nowrap self-start sm:self-auto transition shadow-xs"
          >
            {isHindi ? 'अनुमति दें (Allow Mic)' : 'Allow Microphone'}
          </button>
        </div>
      )}
    </div>
  );
};
