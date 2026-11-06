import { geminiVoiceService } from './geminiVoiceService';
import { processVoiceCommand, isPhantomNoise } from './voiceCommandProcessor';
import type { CommandProcessResult } from './voiceCommandProcessor';
import { speechEngine } from './speechEngine';
import { useAnnouncerStore } from '../store/useAnnouncerStore';
import { useExamStore } from '../store/useExamStore';
import { soundEffects } from './soundEffects';
import { voiceRecognition, isHindiPreferred } from './voiceRecognition';
import { getDataSource } from '../services/dataSource';

export type LiveSessionState = 'idle' | 'listening' | 'user_speaking' | 'processing' | 'assistant_speaking' | 'error';

/**
 * Longest single audio clip handed to transcription.
 *
 * Capped at 5 seconds (down from 12s) to prevent the microphone from running
 * away indefinitely in a noisy room and recording extraneous conversation.
 */
const MAX_SEGMENT_MS = 5_000;

export interface LiveSessionCallbacks {
  onStateChange: (state: LiveSessionState) => void;
  onVolumeChange: (volume: number) => void; // 0 to 100
  onLiveTranscript?: (transcript: string, isFinal: boolean) => void;
  onResult: (result: CommandProcessResult) => void;
  onError: (errMsg: string) => void;
}

export class GeminiLiveVoiceSession {
  private state: LiveSessionState = 'idle';
  /** Guards setState() against being re-entered through the voice service. */
  private isSettingState = false;
  /** Guards against reporting the same failure more than once. */
  private hasReportedError = false;
  /** Whether the browser SpeechRecognition fallback is usable. */
  private browserRecogniserAvailable = false;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private animFrameId: number | null = null;
  private silenceTimer: any = null;
  private finalCommitTimer: any = null;
  /**
   * Hard cap on one recording segment.
   *
   * The segment is normally closed by the voice-activity detector once the user
   * stops talking. Capping it keeps clips inside the window where transcription is accurate.
   */
  private segmentTimeout: any = null;
  private hasSpokenInCurrentChunk = false;
  private isRunning = false;
  private callbacks: Partial<LiveSessionCallbacks> = {};
  private unbindSpeechEnd: (() => void) | null = null;
  private unbindTranscript: (() => void) | null = null;
  private currentSpeechTranscript: string = '';
  private currentAlternatives: string[] = [];
  private currentUtteranceId: number = 0;
  private ambientNoiseFloor: number = 15;
  private speechConsecutiveFrames: number = 0;

  constructor(callbacks: Partial<LiveSessionCallbacks> = {}) {
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: Partial<LiveSessionCallbacks>) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getState(): LiveSessionState {
    return this.state;
  }

  private setState(newState: LiveSessionState) {
    if (this.state === newState) return;

    // Re-entrancy guard.
    //
    // This method writes through to voiceRecognition.setState(), which notifies
    // every registered listener — including the one added in start() that reacts
    // to an 'error' state by calling this.setState() again. The two would bounce
    // off each other until the stack overflowed, so the state is published to
    // the voice service exactly once per change.
    if (this.isSettingState) return;
    this.isSettingState = true;
    try {
      this.state = newState;
      this.callbacks.onStateChange?.(newState);

      // Sync with global voice state for Header and Accessibility indicators
      if (newState === 'listening' || newState === 'user_speaking') {
        voiceRecognition.setState('listening');
      } else if (newState === 'assistant_speaking') {
        voiceRecognition.setState('speaking');
      } else if (newState === 'processing') {
        voiceRecognition.setState('processing');
      } else if (newState === 'error') {
        voiceRecognition.setState('error');
      } else {
        voiceRecognition.setState('idle');
      }
    } finally {
      this.isSettingState = false;
    }
  }

  /**
   * Single place a live session failure is reported.
   *
   * Idempotent, because recognition can report the same problem more than once
   * (a denied microphone triggers both onStateChange('error') and onError).
   * Sets the state directly rather than through setState(), since the voice
   * service is the thing that is failing — writing back to it would re-enter.
   */
  private fail(message: string): void {
    if (this.hasReportedError) return;
    this.hasReportedError = true;

    this.state = 'error';
    this.callbacks.onStateChange?.('error');
    this.callbacks.onError?.(message);
    this.stop();
  }

  /**
   * Start live bidirectional AI voice session (Gemini / ChatGPT style)
   */
  public async start(): Promise<boolean> {
    if (this.isRunning) return true;

    this.hasReportedError = false;

    // The browser recogniser is only a fallback now — transcription happens on
    // the server via Whisper. So its availability is deliberately NOT a
    // precondition: refusing to start because SpeechRecognition is missing
    // would block a path that works perfectly well without it.
    this.browserRecogniserAvailable = voiceRecognition.isSupported();

    try {
      soundEffects.playMicStart();

      // Hold the microphone ourselves and transcribe on the server.
      //
      // The browser's SpeechRecognition streams audio to Google's own speech
      // service. Where that is unreachable it fires onstart and then dies with
      // "aborted" having received no audio at all — while getUserMedia on the
      // very same machine peaks at 245/255, proving the microphone is fine.
      // Recording locally and running Whisper through our backend removes that
      // entire failure mode, and handles Hindi and English in one pass.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: { ideal: 16000 },
        },
      });
      this.mediaStream = stream;
      this.isRunning = true;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();

      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      this.analyser = analyser;

      this.startVolumeMonitoring();
      this.startSegmentRecording();

      // Start real-time speech recognition for live streaming words & instant zero-latency NLP fallback
      this.unbindTranscript = voiceRecognition.addListener({
        onTranscript: (transcript: string, isFinal: boolean, alternatives?: string[]) => {
          if (transcript.trim() && !isPhantomNoise(transcript.trim())) {
            this.currentSpeechTranscript = transcript.trim();
            if (alternatives && alternatives.length > 0) {
              this.currentAlternatives = alternatives.filter((a) => !isPhantomNoise(a));
            }
            this.callbacks.onLiveTranscript?.(transcript.trim(), isFinal);

            // Speech activity is now derived from the transcript
            this.hasSpokenInCurrentChunk = true;
            if (this.state === 'listening') this.setState('user_speaking');

            // If a final recognition arrives while user spoke, commit promptly after brief settle (300ms).
            // This timer is protected so background noise will not wipe it out and force 12s of recording.
            if (isFinal && this.isRunning) {
              if (this.silenceTimer) {
                clearTimeout(this.silenceTimer);
                this.silenceTimer = null;
              }
              if (this.finalCommitTimer) {
                clearTimeout(this.finalCommitTimer);
              }
              this.finalCommitTimer = setTimeout(() => {
                this.finalCommitTimer = null;
                if (this.isRunning && this.hasSpokenInCurrentChunk) {
                  this.commitCurrentUtterance();
                }
              }, 300);
            }
          }
        },
        onStateChange: (state) => {
          // The browser recogniser is a fallback only, so its errors are logged
          // rather than treated as a session failure — the microphone stream
          // and server transcription are the real path and are unaffected.
          if (state === 'error') {
            console.warn('[VoiceLive] browser recogniser error; server transcription still active');
          }
        },
        onError: (message) => {
          console.warn('[VoiceLive] browser recogniser error:', message);
        },
      });

      // The browser recogniser is a best-effort fallback. If it refuses to
      // start, that is NOT a failure: the microphone stream and the server-side
      // transcription are what actually carry voice input now.
      if (this.browserRecogniserAvailable && !voiceRecognition.start()) {
        console.warn('[VoiceLive] browser recogniser unavailable, continuing with server transcription');
        voiceRecognition.stop();
      }

      // Listen for assistant speech completion to resume listening
      this.unbindSpeechEnd = speechEngine.onSpeechEnd(() => {
        if (this.isRunning && this.state === 'assistant_speaking') {
          setTimeout(() => {
            if (this.isRunning && !speechEngine.isSpeaking() && !speechEngine.isEchoGuardActive()) {
              this.currentSpeechTranscript = '';
              this.audioChunks = [];
              this.hasSpokenInCurrentChunk = false;
              this.setState('listening');
              this.startSegmentRecording();
            }
          }, 850);
        }
      });

      this.setState('listening');
      return true;
    } catch (err: any) {
      // Reached when getUserMedia is refused. This IS a real failure: without a
      // microphone stream there is nothing to record and nothing to transcribe.
      console.error('Failed to start Gemini Live voice session:', err);
      this.fail(
        'Microphone access denied. Allow the microphone in your browser address bar, then try again.'
      );
      return false;
    }
  }

  private startSegmentRecording() {
    if (!this.mediaStream || !this.isRunning) return;
    if (this.segmentTimeout) {
      clearTimeout(this.segmentTimeout);
      this.segmentTimeout = null;
    }

    try {
      this.audioChunks = [];
      this.hasSpokenInCurrentChunk = false;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = new MediaRecorder(this.mediaStream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (this.segmentTimeout) {
          clearTimeout(this.segmentTimeout);
          this.segmentTimeout = null;
        }
        if (this.hasSpokenInCurrentChunk && this.audioChunks.length > 0 && this.isRunning) {
          const blobType = recorder.mimeType || 'audio/webm';
          const fullAudioBlob = new Blob(this.audioChunks, { type: blobType });
          this.audioChunks = [];
          this.hasSpokenInCurrentChunk = false;
          this.dispatchAudioToGemini(fullAudioBlob);
        } else if (this.isRunning && this.state !== 'processing' && this.state !== 'assistant_speaking') {
          // Restart segment if silence or no audio
          this.audioChunks = [];
          this.hasSpokenInCurrentChunk = false;
          this.startSegmentRecording();
        }
      };

      recorder.start(100);
      this.mediaRecorder = recorder;

      // Close the segment if user has been speaking continuously for MAX_SEGMENT_MS
      this.segmentTimeout = setTimeout(() => {
        if (this.isRunning && recorder.state !== 'inactive') {
          if (this.hasSpokenInCurrentChunk) {
            this.commitCurrentUtterance();
          } else {
            // No speech detected in 12s. Do NOT force hasSpokenInCurrentChunk to true!
            // Cleanly restart segment to recycle memory without sending silence to Whisper.
            try {
              recorder.stop();
            } catch {}
          }
        }
      }, MAX_SEGMENT_MS);
    } catch (err) {
      console.warn('Failed to start MediaRecorder segment:', err);
    }
  }

  /**
   * Monitor real-time mic volume and detect Voice Activity (VAD) with dynamic noise calibration
   */
  private startVolumeMonitoring() {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const checkVolume = () => {
      if (!this.isRunning || !this.analyser) return;

      this.analyser.getByteFrequencyData(dataArray);

      // Compute speech-band audio power (bins 3 to 45 correspond roughly to ~300Hz-3500Hz)
      // ignoring low electrical/fan rumble (<150Hz) and high-frequency hiss
      let speechBandSum = 0;
      const minBin = Math.min(3, dataArray.length - 1);
      const maxBin = Math.min(45, dataArray.length);
      const binCount = Math.max(1, maxBin - minBin);

      for (let i = minBin; i < maxBin; i++) {
        speechBandSum += dataArray[i];
      }
      const avg = speechBandSum / binCount;
      const normalizedVolume = Math.min(100, Math.round((avg / 128) * 100));

      this.callbacks.onVolumeChange?.(normalizedVolume);

      // Guard: Ignore mic input while assistant is speaking aloud or within echo guard window
      if (
        speechEngine.isSpeaking() ||
        speechEngine.isEchoGuardActive() ||
        this.state === 'assistant_speaking'
      ) {
        this.hasSpokenInCurrentChunk = false;
        this.speechConsecutiveFrames = 0;
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
        this.animFrameId = requestAnimationFrame(checkVolume);
        return;
      }

      // Dynamic noise floor tracking: slowly adapt when volume is quiet
      if (normalizedVolume < 40) {
        this.ambientNoiseFloor = this.ambientNoiseFloor * 0.96 + normalizedVolume * 0.04;
      }

      // Voice Activity Detection (VAD)
      if (this.state === 'listening' || this.state === 'user_speaking') {
        // Speech threshold adapts dynamically to room noise floor with a sensible baseline
        const SPEECH_THRESHOLD = Math.max(24, Math.round(this.ambientNoiseFloor + 14));

        if (normalizedVolume > SPEECH_THRESHOLD) {
          this.speechConsecutiveFrames++;
          // Require at least 3 consecutive frames (~50-80ms) above threshold to avoid false triggers from clicks/pops
          if (this.speechConsecutiveFrames >= 3) {
            this.hasSpokenInCurrentChunk = true;
            if (this.state !== 'user_speaking') {
              this.setState('user_speaking');
            }

            // Clear any pending silence timer
            if (this.silenceTimer) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = null;
            }
          }
        } else {
          this.speechConsecutiveFrames = 0;
          if (this.hasSpokenInCurrentChunk) {
            // User was speaking and is now silent: start silence countdown (700ms for fast conversational response)
            if (!this.silenceTimer) {
              this.silenceTimer = setTimeout(() => {
                if (this.hasSpokenInCurrentChunk && this.isRunning) {
                  this.commitCurrentUtterance();
                }
              }, 700);
            }
          }
        }
      }

      this.animFrameId = requestAnimationFrame(checkVolume);
    };

    this.animFrameId = requestAnimationFrame(checkVolume);
  }

  /**
   * Force commit current utterance immediately (e.g. user taps Send / Orb or speech endpoint reached)
   */
  public commitCurrentUtterance() {
    if (this.finalCommitTimer) {
      clearTimeout(this.finalCommitTimer);
      this.finalCommitTimer = null;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.segmentTimeout) {
      clearTimeout(this.segmentTimeout);
      this.segmentTimeout = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
  }

  /**
   * Process spoken audio with Gemini, falling back seamlessly to live transcribed speech & local NLP
   */
  private async dispatchAudioToGemini(audioBlob: Blob) {
    if (!this.isRunning) return;

    const thisUtteranceId = ++this.currentUtteranceId;
    this.setState('processing');

    // 1. Transcribe the recorded clip on the server. This is the primary path
    //    and the one that works: the browser recogniser is kept only as a
    //    fallback below, because it receives no audio when Google's speech
    //    service is unreachable.
    let capturedTranscript = this.currentSpeechTranscript.trim();
    if (isPhantomNoise(capturedTranscript) || speechEngine.isTextEcho(capturedTranscript)) {
      capturedTranscript = '';
    }

    if (!capturedTranscript && audioBlob && audioBlob.size > 1000) {
      try {
        const examState = useExamStore.getState();
        const activeQNum = examState.currentIndex + 1;
        const totalQ = examState.questions?.length || 0;
        const examTitle = examState.currentExam?.title || '';
        const inHindi = isHindiPreferred();
        const dynamicPrompt = inHindi
          ? (examTitle
              ? `परीक्षा: ${examTitle}। सक्रिय प्रश्न संख्या ${activeQNum} कुल ${totalQ} में से। विकल्प 1, 2, 3, 4। अगला सवाल, पिछला सवाल, सबमिट करो।`
              : 'अभ्यर्थी पोर्टल निर्देश: परीक्षा शुरू करो, डैशबोर्ड, एनालिटिक्स, सवाल पढ़ो।')
          : (examTitle
              ? `Exam: ${examTitle}. Active Question: ${activeQNum} of ${totalQ}. Options 1, 2, 3, 4.`
              : 'Candidate portal commands: Start exam, List exams, Practice arena, Analytics.');

        const result = await getDataSource().ai.transcribe(audioBlob, 'clip.webm', {
          prompt: dynamicPrompt,
          language: inHindi ? 'hi' : 'en',
        });
        if (this.currentUtteranceId !== thisUtteranceId || !this.isRunning) return;
        capturedTranscript = result.text.trim();
        console.log('[Live Voice] server transcription:', capturedTranscript);
        if (capturedTranscript) {
          if (isPhantomNoise(capturedTranscript) || speechEngine.isTextEcho(capturedTranscript)) {
            console.log('[Live Voice] Filtered phantom noise token from server transcription:', capturedTranscript);
            capturedTranscript = '';
          } else {
            this.callbacks.onLiveTranscript?.(capturedTranscript, true);
          }
        }
      } catch (err) {
        console.warn('[Live Voice] server transcription failed:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        if (
          errMsg.includes('Session expired') ||
          errMsg.includes('Authentication required') ||
          errMsg.includes('401')
        ) {
          this.stop();
          this.callbacks.onError?.('Session expired. Voice assistant stopped.');
          return;
        }
      }
    }

    // Fallback: if the server could not transcribe, give the browser recogniser
    // a brief chance before giving up.
    if (!capturedTranscript && this.hasSpokenInCurrentChunk) {
      const waitStart = Date.now();
      while (!this.currentSpeechTranscript.trim() && Date.now() - waitStart < 1200) {
        await new Promise((r) => setTimeout(r, 60));
        if (!this.isRunning || this.currentUtteranceId !== thisUtteranceId) return;
      }
      capturedTranscript = this.currentSpeechTranscript.trim();
    }

    const capturedAlternatives = [...this.currentAlternatives];
    this.currentSpeechTranscript = '';
    this.currentAlternatives = [];

    // If completely silent/noise with no transcript, resume listening smoothly
    if (!capturedTranscript) {
      console.log('[Live Voice] No speech recognized in audio, resuming listening.');
      this.setState('listening');
      this.startSegmentRecording();
      return;
    }

    let result: CommandProcessResult | null = null;

    // 1. High-Precision Instant Local NLP (handles "Option 1-4", "Next question", "Read question", "Clear option", etc.)
    // Local NLP runs in 0ms without waiting for slow external APIs
    if (capturedTranscript) {
      const candidates = [capturedTranscript, ...capturedAlternatives];
      const localResult = processVoiceCommand(candidates);
      if (
        localResult &&
        localResult.success &&
        localResult.intent !== 'FALLBACK' &&
        localResult.intent !== 'UNRECOGNIZED'
      ) {
        console.log('[Live Voice] Instantly executed via high-precision local NLP:', localResult.intent);
        result = localResult;
      }
    }

    // 2. Multimodal Audio via Gemini (only if a valid Google AI Studio key starting with AIzaSy is configured)
    if (!result && geminiVoiceService.hasValidGeminiKey() && audioBlob && audioBlob.size > 1000) {
      try {
        result = await geminiVoiceService.processAudioWithGemini(audioBlob);
      } catch (err) {
        console.warn('[Live Voice] Gemini audio processing failed:', err);
      }
    }

    // Discard stale in-flight responses if user already spoke again or stopped
    if (this.currentUtteranceId !== thisUtteranceId || !this.isRunning) {
      console.log(`[Live Voice] Utterance #${thisUtteranceId} stale, skipping.`);
      return;
    }

    // 3. Fallback to Gemini / Groq Text LLM for natural language queries (e.g. conversational questions)
    if (!result && capturedTranscript && geminiVoiceService.hasApiKey()) {
      try {
        result = await geminiVoiceService.processTextWithGemini(capturedTranscript);
      } catch (err) {
        console.warn('[Live Voice] Gemini/Groq text processing failed:', err);
      }
    }

    // Discard if newer utterance began while Gemini text was resolving
    if (this.currentUtteranceId !== thisUtteranceId || !this.isRunning) {
      console.log(`[Live Voice] Utterance #${thisUtteranceId} stale, skipping.`);
      return;
    }

    // 4. Final attempt with local NLP if text LLM returned null
    if (!result && capturedTranscript) {
      const fallbackResult = processVoiceCommand([capturedTranscript, ...capturedAlternatives]);
      if (fallbackResult.intent !== 'UNRECOGNIZED') {
        result = fallbackResult;
      }
    }

    if (this.currentUtteranceId !== thisUtteranceId || !this.isRunning) return;

    if (result && result.intent !== 'UNRECOGNIZED' && result.assistantReply) {
      this.callbacks.onResult?.(result);

      // Assistant speaking state: for a locally recognised command the reply is
      // already being spoken, and this must not restart it. When the answer
      // came from the LLM instead, nothing has spoken yet — announce it so both
      // the candidate and the ARIA live region get the same text.
      this.setState('assistant_speaking');
      this.currentSpeechTranscript = '';
      if (!speechEngine.isSpeaking()) {
        useAnnouncerStore.getState().announce(result.assistantReply, 'assertive', true);
      }
    } else {
      // Acoustic noise, silence, or phantom token: resume listening silently without speaking
      this.setState('listening');
      this.startSegmentRecording();
    }
  }

  /**
   * Stop the live voice session
   */
  public stop() {
    this.isRunning = false;
    soundEffects.playMicStop();

    if (this.finalCommitTimer) {
      clearTimeout(this.finalCommitTimer);
      this.finalCommitTimer = null;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.segmentTimeout) {
      clearTimeout(this.segmentTimeout);
      this.segmentTimeout = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.unbindSpeechEnd) {
      this.unbindSpeechEnd();
      this.unbindSpeechEnd = null;
    }

    if (this.unbindTranscript) {
      this.unbindTranscript();
      this.unbindTranscript = null;
    }
    voiceRecognition.stop();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.mediaRecorder = null;
    this.audioChunks = [];

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.setState('idle');
  }

  public toggle(): boolean {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }
}
