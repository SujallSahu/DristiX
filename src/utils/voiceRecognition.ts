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
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('dristix_voice_lang');
      if (saved === 'hi-IN' || saved === 'en-US') {
        this.languageMode = saved;
        this.currentLanguage = saved;
      }
    }
    this.initRecognition();
    this.bindSpeechEngineLifecycle();
  }

  private bindSpeechEngineLifecycle() {
    speechEngine.onSpeechStart(() => {
      // When TTS is vocalizing, visually indicate speaking and abort speech recognition to prevent speaker leakage
      if (this.isListeningActive) {
        this.setState('speaking');
        try {
          this.recognition?.abort();
        } catch {}
      }
    });

    speechEngine.onSpeechEnd(() => {
      // When TTS finishes, restore listening state after reverb decay window
      if (this.isListeningActive) {
        setTimeout(() => {
          if (this.isListeningActive && !speechEngine.isSpeaking()) {
            this.setState('listening');
            try {
              this.recognition?.start();
            } catch {}
          }
        }, 350);
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

    // If candidate gave an intentional command (e.g. "अगला प्रश्न", "Next", "Option 2", "बैक", "सबमिट"),
    // immediately silence TTS and dispatch with zero delay!
    const isAuthOrCredential =
      /@|gmail|googlemail|email|mail|dot\s*com|एट|जीमेल|ईमेल|डाट\s*काम|password|passcode|pass|pin|पिन|पासवर्ड|पासकोड|student\d+|dx-\d+/i.test(transcript) ||
      (alternatives && alternatives.some((alt) => /@|gmail|googlemail|email|mail|dot\s*com|एट|जीमेल|ईमेल|डाट\s*काम|password|passcode|pass|pin|पिन|पासवर्ड|पासकोड|student\d+|dx-\d+/i.test(alt)));

    const filteredAlternatives = alternatives
      ? alternatives.filter((alt) => !speechEngine.isTextEcho(alt) && !isPhantomNoise(alt))
      : undefined;

    if (isCommand || isAuthOrCredential) {
      if (speechEngine.isSpeaking()) {
        speechEngine.stop();
      }
      this.listeners.forEach((cb) => cb.onTranscript(transcript, isFinal, filteredAlternatives));
      return;
    }

    // Suppress if the transcript is an echo of the assistant's own voice or within echo guard window
    if (
      speechEngine.isSpeaking() ||
      speechEngine.isEchoGuardActive() ||
      speechEngine.isTextEcho(transcript)
    ) {
      const cleanLower = transcript.trim().toLowerCase();
      const isExplicitStop = /^(?:stop|ruko|chup|pause|wait)$/i.test(cleanLower);
      if (isExplicitStop && !speechEngine.isTextEcho(transcript)) {
        speechEngine.stop();
        return;
      }
      console.log('Suppressed acoustic speaker echo transcript:', transcript);
      return;
    }

    // Suppress phantom noise hallucinations (such as 'so', 'sau', etc.) from ambient background
    if (isPhantomNoise(transcript)) {
      console.log('🔇 Suppressed phantom noise transcript:', transcript);
      return;
    }

    this.listeners.forEach((cb) => cb.onTranscript(transcript, isFinal, filteredAlternatives));
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
 * Checks if the utterance requests or uses any language other than English or Hindi.
 * DristiX strictly supports and entertains ONLY English and Hindi.
 */
export function isOtherLanguageRequested(text?: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();

  // 1. Explicit requests to switch, translate, explain, or speak in any language OTHER than English or Hindi
  const otherLangPattern =
    /(?:in|into|to|speak|explain|talk|tell|translate|switch\s+to|change\s+to|convert\s+to|set\s+language\s+to)\s+(?:spanish|french|german|japanese|chinese|mandarin|russian|arabic|bengali|bangla|tamil|telugu|marathi|gujarati|urdu|kannada|malayalam|punjabi|odia|oriya|assamese|italian|portuguese|korean|turkish|persian|farsi|sanskrit|dutch|swedish|latin)\b/i;

  const otherLangExact =
    /^(?:spanish|french|german|japanese|chinese|mandarin|russian|arabic|bengali|bangla|tamil|telugu|marathi|gujarati|urdu|kannada|malayalam|punjabi|odia|oriya|assamese|italian|portuguese|korean|turkish|persian|farsi|sanskrit|dutch|swedish|latin)(?:\s+(?:language|please))?$/i;

  const otherLangHinglish =
    /(?:spanish|french|german|japanese|chinese|mandarin|russian|arabic|bengali|bangla|tamil|telugu|marathi|gujarati|urdu|kannada|malayalam|punjabi|odia|oriya|assamese|italian|portuguese|korean|turkish|persian|farsi|sanskrit)\s+me\s+(?:baat\s+karo|bolo|batao|samjhao|padho|kaho|sunao|kijiye|dijiye|karo|change|switch)/i;

  const otherLangDevanagari =
    /(?:फ्रेंच|स्पैनिश|स्पेनिश|जर्मन|जापानी|चीनी|चाइनीज|रूसी|रशियन|अरबी|बंगाली|बांग्ला|तमिल|तेलुगु|मराठी|गुजराती|उर्दू|कन्नड़|मलयालम|पंजाबी|ओडिया|उड़िया|इटालियन|पुर्तगाली|कोरियन|तुर्की|फ़ारसी|फारसी|संस्कृत)\s*(?:में)?\s*(?:बात\s*करो|बातचीत\s*करो|बोलो|बताओ|समझाओ|कहो|सुनाओ|करो|कीजिए|चेंज\s*करो|बदलो|स्विच\s*करो|बोलिए|बताइए|समझाइए|चाहिए|प्लीज)/i;

  const otherLangDevanagariReverse =
    /(?:बात\s*करो|बातचीत\s*करो|बोलो|बताओ|समझाओ|कहो|सुनाओ|बोलिए|बताइए|समझाइए)\s*(?:फ्रेंच|स्पैनिश|स्पेनिश|जर्मन|जापानी|चीनी|चाइनीज|रूसी|रशियन|अरबी|बंगाली|बांग्ला|तमिल|तेलुगु|मराठी|गुजराती|उर्दू|कन्नड़|मलयालम|पंजाबी|ओडिया|उड़िया|इटालियन|पुर्तगाली|कोरियन|तुर्की|फ़ारसी|फारसी|संस्कृत)\s*में/i;

  const otherLangDevanagariExact =
    /^(?:फ्रेंच|स्पैनिश|स्पेनिश|जर्मन|जापानी|चीनी|चाइनीज|रूसी|रशियन|अरबी|बंगाली|बांग्ला|तमिल|तेलुगु|मराठी|गुजराती|उर्दू|कन्नड़|मलयालम|पंजाबी|ओडिया|उड़िया|इटालियन|पुर्तगाली|कोरियन|तुर्की|फ़ारसी|फारसी|संस्कृत)(?:\s*(?:में|प्लीज|भाषा|लैंग्वेज|करो))?$/i;

  // 2. Utterances containing non-Latin, non-Devanagari foreign scripts (e.g. Cyrillic, Arabic, CJK, Hangul, Bengali, Tamil, Telugu)
  const foreignScript = /[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\uAC00-\uD7AF\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F]/.test(lower);

  return (
    otherLangPattern.test(lower) ||
    otherLangExact.test(lower) ||
    otherLangHinglish.test(lower) ||
    otherLangDevanagari.test(lower) ||
    otherLangDevanagariReverse.test(lower) ||
    otherLangDevanagariExact.test(lower) ||
    foreignScript
  );
}

/**
 * Detects whether an utterance expresses an explicit request to switch or explain
 * in English or Hindi, or requests an unsupported language.
 */
export function detectLanguageSwitchIntent(text?: string): 'en' | 'hi' | 'unsupported' | null {
  if (!text) return null;
  if (isOtherLanguageRequested(text)) return 'unsupported';
  const lower = text.toLowerCase().trim();

  // 1. Explicit English triggers (Phrases requesting English explanations or mode)
  const wantsEnglish =
    // English phrasing
    /(?:explain|speak|talk|tell|say|read|give|translate|narrate|guide|answer|respond|communicate|should\s+communicate)\s+(?:me\s+)?(?:everything\s+)?(?:in|into)\s+english(?:\s+language)?/i.test(lower) ||
    /(?:switch|change|convert|set|turn)\s+(?:the\s+)?(?:voice\s+)?(?:language|mode)?\s*(?:to\s+)?english/i.test(lower) ||
    /(?:english\s+(?:language|mode|voice|please)|in\s+english(?:\s+please)?)$/i.test(lower) ||
    /^(?:english|speak\s+english|talk\s+in\s+english|explain\s+in\s+english|in\s+english|english\s+please|english\s+language|switch\s+to\s+english|switch\s+english)$/i.test(lower) ||
    /(?:make\s+it\s+english|change\s+to\s+english|switch\s+to\s+english)/i.test(lower) ||
    // Hinglish (Roman Hindi)
    /(?:english|angrezi|angreji)\s+me\s+(?:baat\s+karo|bolo|batao|samjhao|padho|kaho|sunao|kijiye|dijiye|karo|change|switch)/i.test(lower) ||
    /(?:angrezi|angreji)\s+me/i.test(lower) ||
    /(?:baat\s+karo|bolo|batao|samjhao|padho|sunao)\s+(?:in\s+)?(?:english|angrezi|angreji)(?:\s+me)?/i.test(lower) ||
    /^(?:angrezi|angreji|angrezi\s+me|angreji\s+me|in\s+angrezi|in\s+angreji)$/i.test(lower) ||
    // Devanagari Hindi phrasing requesting English (including phonetic English transliteration e.g. "स्विच टू इंग्लिश लैंग्वेज")
    /(?:स्विच|चेंज|कन्वर्ट|बदलो|टर्न|सेट)\s*(?:टू\s*|में\s*)?(?:इंग्लिश|अंग्रेजी|अंग्रेज़ी)(?:\s*(?:लैंग्वेज|भाषा|मोड|में))?/i.test(lower) ||
    /(?:शोल्ड|शुड|कैन|प्लीज)?\s*कम्युनिकेट\s*इन\s*(?:इंग्लिश|अंग्रेजी|अंग्रेज़ी)(?:\s*लैंग्वेज)?/i.test(lower) ||
    /(?:इंग्लिश|अंग्रेजी|अंग्रेज़ी|आंग्ल)\s*(?:में)?\s*(?:बात\s*करो|बातचीत\s*करो|बोलो|बताओ|समझाओ|कहो|सुनाओ|करो|कीजिए|चेंज\s*करो|बदलो|स्विच\s*करो|बोलिए|बताइए|समझाइए|चाहिए|प्लीज)/i.test(lower) ||
    /(?:बात\s*करो|बातचीत\s*करो|बोलो|बताओ|समझाओ|कहो|सुनाओ|बोलिए|बताइए|समझाइए)\s*(?:इंग्लिश|अंग्रेजी|अंग्रेज़ी)\s*में/i.test(lower) ||
    /(?:भाषा|लैंग्वेज|बोली)\s*(?:को\s*)?(?:इंग्लिश|अंग्रेजी|अंग्रेज़ी)\s*(?:करो|बदलो|में)/i.test(lower) ||
    /^(?:स्विच\s+)?(?:टू\s+)?(?:इंग्लिश|अंग्रेजी|अंग्रेज़ी)(?:\s*(?:में|प्लीज|भाषा|लैंग्वेज|करो|मोड))?$/i.test(lower) ||
    /(?:इंग्लिश|अंग्रेजी|अंग्रेज़ी)\s*(?:में|लैंग्वेज|भाषा)/i.test(lower);

  if (wantsEnglish) return 'en';

  // 2. Explicit Hindi triggers (Phrases requesting Hindi explanations or mode)
  const wantsHindi =
    // English phrasing
    /(?:explain|speak|talk|tell|say|read|give|translate|narrate|guide|answer|respond|communicate|should\s+communicate)\s+(?:me\s+)?(?:everything\s+)?(?:in|into)\s+hindi(?:\s+language)?/i.test(lower) ||
    /(?:switch|change|convert|set|turn)\s+(?:the\s+)?(?:voice\s+)?(?:language|mode)?\s*(?:to\s+)?hindi/i.test(lower) ||
    /(?:hindi\s+(?:language|mode|voice|please)|in\s+hindi(?:\s+please)?)$/i.test(lower) ||
    /^(?:hindi|speak\s+hindi|talk\s+in\s+hindi|explain\s+in\s+hindi|in\s+hindi|hindi\s+please|hindi\s+language|switch\s+to\s+hindi|switch\s+hindi)$/i.test(lower) ||
    /(?:make\s+it\s+hindi|change\s+to\s+hindi|switch\s+to\s+hindi)/i.test(lower) ||
    // Hinglish (Roman Hindi)
    /hindi\s+me\s+(?:baat\s+karo|bolo|batao|samjhao|padho|kaho|sunao|kijiye|dijiye|karo|change|switch)/i.test(lower) ||
    /(?:baat\s+karo|bolo|batao|samjhao|padho|sunao)\s+(?:in\s+)?hindi(?:\s+me)?/i.test(lower) ||
    /^(?:hindi\s+me|hindi\s+mein)$/i.test(lower) ||
    // Devanagari Hindi phrasing requesting Hindi (including phonetic English transliteration e.g. "शोल्ड कम्युनिकेट इन हिंदी लैंग्वेज")
    /(?:स्विच|चेंज|कन्वर्ट|बदलो|टर्न|सेट)\s*(?:टू\s*|में\s*)?(?:हिंदी|हिन्दी)(?:\s*(?:लैंग्वेज|भाषा|मोड|में))?/i.test(lower) ||
    /(?:शोल्ड|शुड|कैन|प्लीज)?\s*कम्युनिकेट\s*इन\s*(?:हिंदी|हिन्दी)(?:\s*लैंग्वेज)?/i.test(lower) ||
    /(?:हिंदी|हिन्दी)\s*(?:में)?\s*(?:बात\s*करो|बातचीत\s*करो|बोलो|बताओ|समझाओ|कहो|सुनाओ|करो|कीजिए|चेंज\s*करो|बदलो|स्विच\s*करो|बोलिए|बताइए|समझाइए|चाहिए|प्लीज)/i.test(lower) ||
    /(?:बात\s*करो|बातचीत\s*करो|बोलो|बताओ|समझाओ|कहो|सुनाओ|बोलिए|बताइए|समझाइए)\s*(?:हिंदी|हिन्दी)\s*में/i.test(lower) ||
    /(?:भाषा|लैंग्वेज|बोली)\s*(?:को\s*)?(?:हिंदी|हिन्दी)\s*(?:करो|बदलो|में)/i.test(lower) ||
    /^(?:स्विच\s+)?(?:टू\s+)?(?:हिंदी|हिन्दी)(?:\s*(?:में|प्लीज|भाषा|लैंग्वेज|करो|मोड))?$/i.test(lower) ||
    /(?:हिंदी|हिन्दी)\s*(?:में|लैंग्वेज|भाषा)/i.test(lower);

  if (wantsHindi) return 'hi';

  return null;
}

/**
 * Universally sets and persists the voice assistant language across the platform.
 * Dispatches `dristix:language-change` event to sync VoiceAssistantOrb, headers, and UI.
 */
export function applyVoiceLanguageChange(targetLang: 'en-US' | 'hi-IN'): void {
  voiceRecognition.setLanguage(targetLang);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('dristix_voice_lang', targetLang);
    } catch {
      // ignore storage quota errors
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('dristix:language-change', {
        detail: {
          lang: targetLang,
          isHindi: targetLang === 'hi-IN',
        },
      })
    );
  }
}

/**
 * Determines if Hindi should be used for TTS / assistant responses.
 * Returns true if:
 * 1. User query explicitly requested Hindi
 * 2. User explicitly selected Hindi mode ('hi-IN') (unless query explicitly requested English)
 * 3. User spoke in Devanagari script or common Hindi/Hinglish phrasing (in 'auto' mode)
 */
export function isHindiPreferred(query?: string): boolean {
  if (query) {
    const explicitIntent = detectLanguageSwitchIntent(query);
    if (explicitIntent === 'en') return false;
    if (explicitIntent === 'hi') return true;
  }

  const mode = voiceRecognition.getLanguageMode();
  if (mode === 'hi-IN') return true;
  if (mode === 'en-US') return false;

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('dristix_voice_lang');
    if (stored === 'hi-IN') return true;
    if (stored === 'en-US') return false;
  }

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
