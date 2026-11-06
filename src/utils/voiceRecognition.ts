import { speechEngine } from './speechEngine';
import { isPhantomNoise, isIntentionalVoiceCommand } from './voiceCommandProcessor';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

/**
 * Speech recognition language.
 *
 * Only used by the browser-SpeechRecognition fallback. The primary path
 * transcribes on the server, where the Whisper models handle Hindi and English
 * in a single pass and no browser locale negotiation is needed.
 */
export type VoiceLangMode = 'auto' | 'hi-IN' | 'en-IN' | 'en-US';

export interface VoiceRecognitionCallbacks {
  onTranscript: (transcript: string, isFinal: boolean, alternatives?: string[]) => void;
  onStateChange: (state: VoiceState) => void;
  onError: (errorMsg: string) => void;
}

class VoiceRecognitionService {
  private recognition: any = null;
  private isListeningActive: boolean = false;
  private shouldAutoRestart: boolean = false;
  private currentLanguage: 'hi-IN' | 'en-IN' | 'en-US' = 'hi-IN';
  /** 'auto' follows the browser locale and falls back if it yields nothing. */
  private languageMode: VoiceLangMode = 'auto';
  /** Set once auto-mode has tried the other language, to avoid flip-flopping. */
  private hasTriedFallback = false;
  private listeners: Set<VoiceRecognitionCallbacks> = new Set();
  private currentState: VoiceState = 'idle';
  private restartTimeout: any = null;
  /** Last time a word was actually recognised, used to detect a dead mic. */
  private lastTranscriptAt = 0;
  private consecutiveSilentRestarts = 0;

  // MediaRecorder audio capture for 100% reliable direct recording
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];

  constructor() {
    this.initRecognition();
    this.bindSpeechEngineLifecycle();
  }

  private bindSpeechEngineLifecycle() {
    speechEngine.onSpeechStart(() => {
      // When TTS is vocalizing, visually indicate speaking and ignore mic input
      if (this.isListeningActive) {
        this.setState('speaking');
      }
    });

    speechEngine.onSpeechEnd(() => {
      // When TTS finishes, quickly restore listening state without keeping mic muted
      if (this.isListeningActive) {
        setTimeout(() => {
          if (this.isListeningActive && !speechEngine.isSpeaking()) {
            this.setState('listening');

          }
        }, 150);
      }
    });
  }

  /**
   * Whether this browser exposes the Web Speech API.
   *
   * Exposed so the UI can refuse up front with a clear reason. Previously an
   * unsupported browser logged a console warning and then let the UI sit on
   * "Listening…" forever, which looks exactly like a broken microphone.
   */
  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    );
  }

  /**
   * Android Chrome's speech service is unreliable with continuous recognition.
   *
   * With `continuous = true` it commonly produces one utterance, then raises a
   * 'network' error and stops, which left the orb sitting on "Listening…" with
   * nothing ever arriving. Restarting on `onend` is the documented workaround,
   * and the restart path below already exists, so continuous mode is turned off
   * on mobile and each utterance is picked up by that restart instead.
   */
  /**
   * The language actually sent to the speech service.
   *
   * In 'auto' mode this follows the browser locale, so an English laptop gets
   * 'en-US' instead of a hardcoded 'hi-IN' that its speech service may not
   * support at all.
   */
  private get effectiveLanguage(): 'hi-IN' | 'en-IN' | 'en-US' {
    if (this.languageMode !== 'auto') return this.languageMode;
    const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';
    if (nav.toLowerCase().startsWith('hi')) return 'hi-IN';
    return nav.toLowerCase().startsWith('en-in') ? 'en-IN' : 'en-US';
  }

  /** The other language to retry when auto mode hears nothing. */
  private get fallbackLanguage(): 'hi-IN' | 'en-US' {
    return this.currentLanguage === 'hi-IN' ? 'en-US' : 'hi-IN';
  }


  private initRecognition() {
    if (typeof window === 'undefined') return;

    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      // This used to be a silent console.warn, so the voice orb would show
      // "Listening…" with nothing ever arriving. Fail loudly instead.
      this.shouldAutoRestart = false;
      this.isListeningActive = false;
      this.setState('error');
      this.notifyError(
        'Speech recognition is not available in this browser. Live voice input needs Chrome, Edge or another Chromium-based browser.'
      );
      return;
    }

    try {
      const rec = new SpeechRecognitionAPI();
      const isMobile =
        typeof navigator !== 'undefined' &&
        /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');
      // Continuous mode on desktop prevents constant onend/restart cycling
      rec.continuous = !isMobile;
      rec.interimResults = true;
      rec.lang = this.effectiveLanguage;
      rec.maxAlternatives = 5;

      rec.onstart = () => {
        this.isListeningActive = true;
        this.setState('listening');
      };

      rec.onresult = (event: any) => {
        // If TTS is currently speaking or finished within 450ms, drop speaker echo
        if (speechEngine.isSpeaking() || speechEngine.isEchoGuardActive()) {
          return;
        }
        // Any recognised audio proves the mic is live
        this.lastTranscriptAt = Date.now();
        this.consecutiveSilentRestarts = 0;

        let interimTranscript = '';
        let finalTranscript = '';
        const alternatives: string[] = [];

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            finalTranscript += text;
            for (let a = 0; a < result.length; a++) {
              const altText = result[a]?.transcript?.trim();
              if (altText && !alternatives.includes(altText)) {
                alternatives.push(altText);
              }
            }
          } else {
            interimTranscript += text;
          }
        }

        if (finalTranscript.trim()) {
          this.notifyTranscript(finalTranscript.trim(), true, alternatives);
        } else if (interimTranscript.trim()) {
          this.notifyTranscript(interimTranscript.trim(), false);
        }
      };

      rec.onerror = (event: any) => {
        const error = event.error;

        // In Chrome, 'no-speech' and 'aborted' are normal lifecycle timeouts during pauses.
        // They are expected and should be handled smoothly without logging red warnings or stopping.
        if (error === 'no-speech' || error === 'aborted') {
          return;
        }

        if (error === 'not-allowed' || error === 'service-not-allowed') {
          console.warn('Microphone permission denied:', error);
          this.shouldAutoRestart = false;
          this.isListeningActive = false;
          this.setState('error');
          this.notifyError(
            'Microphone access was denied. Please allow microphone permission in your browser address bar.'
          );
          return;
        }

        // On any transient connection error, schedule a smooth restart
        if (this.shouldAutoRestart) {
          this.scheduleRestart(400);
        }
      };

      rec.onend = () => {
        // Auto-restart if listening is active and user has not stopped it
        if (this.shouldAutoRestart && this.isListeningActive) {
          if (speechEngine.isSpeaking()) {
            this.setState('speaking');
            this.scheduleRestart(250);
          } else {
            this.scheduleRestart(100);
          }
        } else {
          this.isListeningActive = false;
          if (this.currentState !== 'error') {
            this.setState('idle');
          }
        }
      };

      this.recognition = rec;
    } catch (err) {
      console.error('Failed to initialize SpeechRecognition:', err);
    }
  }

  private scheduleRestart(delayMs = 150) {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (!this.shouldAutoRestart || !this.isListeningActive) return;

    this.restartTimeout = setTimeout(() => {
      if (!this.shouldAutoRestart || !this.isListeningActive) return;
      if (speechEngine.isSpeaking()) {
        this.scheduleRestart(250);
        return;
      }

      // Seamlessly switch between auto languages if prolonged silence
      if (
        this.languageMode === 'auto' &&
        !this.hasTriedFallback &&
        Date.now() - this.lastTranscriptAt > 20000
      ) {
        this.currentLanguage = this.fallbackLanguage;
        this.hasTriedFallback = true;
        this.initRecognition();
      }

      try {
        if (!this.recognition) {
          this.initRecognition();
        }
        this.recognition?.start();
        this.setState('listening');
      } catch (err: any) {
        if (err?.name === 'InvalidStateError') {
          // Already running, which is fine
          this.setState('listening');
        } else {
          // Re-create instance and retry
          this.initRecognition();
          try {
            this.recognition?.start();
            this.setState('listening');
          } catch {
            setTimeout(() => this.scheduleRestart(350), 350);
          }
        }
      }
    }, delayMs);
  }

  private notifyTranscript(transcript: string, isFinal: boolean, alternatives?: string[]) {
    const isCommand =
      isIntentionalVoiceCommand(transcript) ||
      (alternatives && alternatives.some((alt) => isIntentionalVoiceCommand(alt)));

    // If candidate gave an explicit command (e.g. "Yes, Final Submit", "Continue to Exam", "Option 2"),
    // immediately silence TTS and dispatch with zero delay!
    const isAuthOrCredential =
      /@|gmail|googlemail|email|mail|dot\s*com|एट|जीमेल|ईमेल|डाट\s*काम|password|passcode|pass|pin|पिन|पासवर्ड|पासकोड|student\d+|dx-\d+/i.test(transcript) ||
      (alternatives && alternatives.some((alt) => /@|gmail|googlemail|email|mail|dot\s*com|एट|जीमेल|ईमेल|डाट\s*काम|password|passcode|pass|pin|पिन|पासवर्ड|पासकोड|student\d+|dx-\d+/i.test(alt)));

    // Suppress if the transcript is an echo of the assistant's own voice or within echo guard window
    if (speechEngine.isSpeaking() || speechEngine.isEchoGuardActive() || speechEngine.isTextEcho(transcript)) {
      const cleanLower = transcript.trim().toLowerCase();
      const isExplicitStop = /^(?:stop|ruko|chup|pause|wait)$/i.test(cleanLower);
      if (isExplicitStop && !speechEngine.isTextEcho(transcript)) {
        speechEngine.stop();
        return;
      }
      console.log('Suppressed acoustic speaker echo transcript:', transcript);
      return;
    }

    if (isCommand || isAuthOrCredential) {
      if (speechEngine.isSpeaking()) {
        speechEngine.stop();
      }
      this.listeners.forEach((cb) => cb.onTranscript(transcript, isFinal, alternatives));
      return;
    }

    // Suppress phantom noise hallucinations (such as 'so', 'sau', etc.) from ambient background
    if (isPhantomNoise(transcript)) {
      console.log('🔇 Suppressed phantom noise transcript:', transcript);
      return;
    }

    this.listeners.forEach((cb) => cb.onTranscript(transcript, isFinal, alternatives));
  }

  private notifyError(error: string) {
    this.listeners.forEach((cb) => cb.onError(error));
  }

  private notifyState(state: VoiceState) {
    this.listeners.forEach((cb) => cb.onStateChange(state));
  }

  public addListener(callbacks: VoiceRecognitionCallbacks): () => void {
    this.listeners.add(callbacks);
    return () => {
      this.listeners.delete(callbacks);
    };
  }

  public setCallbacks(callbacks: VoiceRecognitionCallbacks) {
    this.listeners.clear();
    this.listeners.add(callbacks);
  }

  public setState(state: VoiceState) {
    this.currentState = state;
    this.notifyState(state);
  }

  public getState(): VoiceState {
    return this.currentState;
  }

  public isAvailable(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    );
  }

  /** The language the speech service is currently being asked for. */
  public getLanguage(): 'hi-IN' | 'en-IN' | 'en-US' {
    return this.currentLanguage;
  }

  public getConsecutiveSilentRestarts(): number { return this.consecutiveSilentRestarts; }

  public getLanguageMode(): VoiceLangMode {
    return this.languageMode;
  }

  public isHindiMode(): boolean {
    return this.languageMode === 'hi-IN';
  }

  /**
   * Selects the recognition language. Accepts 'auto', which follows the browser
   * locale and retries the other language if nothing is heard.
   *
   * This was never called from anywhere, so the language stayed pinned to the
   * initial 'hi-IN' no matter what the user picked in the UI.
   */
  public setLanguage(lang: VoiceLangMode) {
    const next = lang === 'auto' ? this.effectiveLanguageOf() : lang;
    if (this.languageMode === lang && this.currentLanguage === next) return;

    this.languageMode = lang;
    this.currentLanguage = next;
    this.hasTriedFallback = false;
    this.consecutiveSilentRestarts = 0;
    this.lastTranscriptAt = Date.now();

    // `lang` is only fixed at construction time, so a live session needs a new
    // recognition instance rather than a property assignment.
    this.initRecognition();
    if (this.isListeningActive) this.scheduleRestart(200);
  }

  private effectiveLanguageOf(): 'hi-IN' | 'en-IN' | 'en-US' {
    const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';
    if (nav.toLowerCase().startsWith('hi')) return 'hi-IN';
    return nav.toLowerCase().startsWith('en-in') ? 'en-IN' : 'en-US';
  }

  /**
   * Begins listening. Returns false when recognition could not be started, so
   * callers can surface the reason instead of showing a listening state that
   * will never receive a word.
   */
  public start(): boolean {
    this.shouldAutoRestart = true;
    this.isListeningActive = true;
    this.lastTranscriptAt = Date.now();
    this.consecutiveSilentRestarts = 0;
    this.hasTriedFallback = false;

    if (!this.recognition) {
      this.initRecognition();
    }

    if (!this.recognition) {
      this.shouldAutoRestart = false;
      this.isListeningActive = false;
      this.notifyError(
        'Speech recognition is not available in this browser. Live voice input needs Chrome, Edge or another Chromium-based browser.'
      );
      return false;
    }

    try {
      this.recognition.start();
      this.setState('listening');
      return true;
    } catch (err: any) {
      if (err?.name === 'InvalidStateError') {
        // Already running, which is fine.
        this.setState('listening');
        return true;
      }
      this.initRecognition();
      if (!this.recognition) return false;
      try {
        this.recognition.start();
        this.setState('listening');
        return true;
      } catch (retryErr: any) {
        this.scheduleRestart(250);
        this.notifyError(
          retryErr?.name === 'NotAllowedError'
            ? 'Microphone access was denied. Allow microphone permission for this site, then try again.'
            : 'Could not start the microphone. Please try again.'
        );
        return false;
      }
    }
  }

  public stop() {
    this.shouldAutoRestart = false;
    this.isListeningActive = false;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    }

    this.stopAudioRecording();
    this.setState('idle');
  }

  public toggle(): boolean {
    if (this.isListeningActive) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  // ==========================================
  // Direct MediaRecorder Audio Stream Support
  // ==========================================
  public async startAudioRecording(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      this.audioChunks = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      recorder.start(250);
      this.mediaRecorder = recorder;
      return true;
    } catch (err) {
      console.warn('Failed to start audio recording stream:', err);
      return false;
    }
  }

  public stopAudioRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        this.audioChunks = [];
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }
        this.mediaRecorder = null;
        resolve(blob);
      };

      try {
        this.mediaRecorder.stop();
      } catch {
        resolve(null);
      }
    });
  }
}

export const voiceRecognition = new VoiceRecognitionService();

/**
 * Determines if Hindi should be used for TTS / assistant responses.
 * Returns true if:
 * 1. User explicitly selected Hindi mode ('hi-IN')
 * 2. User spoke in Devanagari script or common Hindi/Hinglish phrasing (in 'auto' mode)
 */
export function isHindiPreferred(query?: string): boolean {
  const mode = voiceRecognition.getLanguageMode();
  if (mode === 'hi-IN') return true;
  if (mode === 'en-US') return false;
  if (!query) return false;
  // If Devanagari script is present
  if (/[\u0900-\u097F]/.test(query)) return true;
  // Common Roman Hindi / Hinglish tokens
  const hindiTokens = [
    'kya', 'kyun', 'kaise', 'batao', 'suno', 'sunao', 'padho', 'chuno', 'sawal',
    'prashna', 'agla', 'pichla', 'kitne', 'sahi', 'galat', 'meri', 'mera', 'mere',
    'kholo', 'khatam', 'wapas', 'jao', 'chalo', 'dikhao', 'hai', 'hain', 'tha', 'the',
    'parinaam', 'kaun', 'kon', 'chahiye', 'karo', 'kar', 'kripya', 'shuru', 'bataiye'
  ];
  const words = query.toLowerCase().split(/[\s,.-]+/);
  return words.some((w) => hindiTokens.includes(w));
}
