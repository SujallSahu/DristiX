import { verbalizeForSpeech } from './mathVerbalizer';

/**
 * Built-in Web Speech API Controller for visually impaired candidates
 * Provides reliable TTS with Chrome pause/resume bug fixes and language defaults.
 */

/**
 * Standard Microsoft Edge / Azure Neural TTS Voice Identifiers:
 * - Hindi (Devanagari): hi-IN-MadhurNeural (Natural Hindi neural voice)
 * - Hinglish (Roman Hindi): en-IN-NeerjaNeural (Natural Indian English voice with fluent Hinglish phonology)
 * - English (Default): en-US-AvaMultilingualNeural (State-of-the-art multilingual English neural voice)
 */
export const EDGE_TTS_VOICES = {
  HINDI: 'hi-IN-MadhurNeural',
  HINGLISH: 'en-IN-NeerjaNeural',
  ENGLISH: 'en-US-AvaMultilingualNeural',
} as const;

export type SpeechModality = 'hindi' | 'hinglish' | 'english';

export interface LanguageDetectionResult {
  modality: SpeechModality;
  lang: 'hi-IN' | 'en-IN' | 'en-US';
  recommendedVoiceId: string;
}

export function detectLanguage(text: string): LanguageDetectionResult {
  // 1. If text contains Devanagari script, it is definitely Hindi (Devanagari)
  if (/[\u0900-\u097F]/.test(text)) {
    return {
      modality: 'hindi',
      lang: 'hi-IN',
      recommendedVoiceId: EDGE_TTS_VOICES.HINDI,
    };
  }

  // 2. Check for common Romanized Hindi / Hinglish keywords
  const hinglishWords = [
    'hai', 'hain', 'ho', 'hoga', 'hogi', 'honge', 'tha', 'thi', 'the',
    'aapka', 'aapki', 'aapke', 'kripya', 'sawal', 'sawaal', 'uttar', 'pariksha',
    'samay', 'chuna', 'chune', 'chuno', 'gaya', 'gayi', 'agla', 'pichhla',
    'batao', 'bataiye', 'karein', 'karo', 'kijiye', 'namaste', 'shuru',
    'khatam', 'samapt', 'nahi', 'nahin', 'raha', 'rahi', 'rahe', 'liye',
    'badla', 'diya', 'di', 'khola', 'khol', 'padha', 'padho', 'pehle',
    'kholiye', 'sakte', 'sakta', 'sakti', 'vikalp', 'shukriya', 'theek',
    'ruko', 'ruk', 'chahiye', 'kaise', 'kya', 'kyun', 'bhi', 'aur', 'par',
    'se', 'ko', 'ka', 'ki', 'ke', 'mein', 'mera', 'meri', 'mere'
  ];
  const lowerWords = text.toLowerCase().split(/[\s,.-]+/);
  const matchCount = lowerWords.filter((w) => hinglishWords.includes(w)).length;
  if (matchCount >= 2 || (lowerWords.length <= 6 && matchCount >= 1)) {
    return {
      modality: 'hinglish',
      lang: 'en-IN',
      recommendedVoiceId: EDGE_TTS_VOICES.HINGLISH,
    };
  }

  // 3. Default is English
  return {
    modality: 'english',
    lang: 'en-US',
    recommendedVoiceId: EDGE_TTS_VOICES.ENGLISH,
  };
}

class SpeechEngine {
  private synth: SpeechSynthesis | null = null;
  public enabled: boolean = true;
  public rate: number = 1.0;
  public pitch: number = 1.0;
  public selectedVoiceURI: string = '';
  private voices: SpeechSynthesisVoice[] = [];
  private speechStartListeners: Set<() => void> = new Set();
  private speechEndListeners: Set<() => void> = new Set();
  private internalSpeaking: boolean = false;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private watchdogTimer: any = null;
  private lastSpeechEndTime: number = 0;
  private lastSpokenText: string = '';
  private lastSpokenAt: number = 0;
  /**
   * Handle to the `speak()` call that is still waiting out its start delay.
   *
   * `synth.cancel()` does not touch a `setTimeout` that has already been
   * scheduled, so without clearing it here a cancelled announcement still ran
   * and played. Several call sites announce one action in quick succession —
   * the confirmation, the store's own "starting…" line, and the auto-read of
   * question 1 — and every one of them survived the cancel, so the candidate
   * heard the same sentence start over two or three times.
   */
  private pendingSpeakTimer: any = null;
  /**
   * Incremented whenever an in-flight `speak()` must be abandoned. The timer
   * captures the value it was scheduled under and does nothing if it has moved
   * on since.
   */
  private speakGeneration = 0;
  /**
   * Set when speech is cut short from outside — an explicit stop, or a newer
   * announcement taking over — instead of running to its own end.
   *
   * `onSpeechEnd` alone cannot tell the two apart, so a listener waiting for
   * the confirmation to finish before speaking next would happily start talking
   * over an intentional stop. It is cleared the moment `speak()` commits to new
   * speech, so it never carries over to the next announcement.
   */
  private interruptedAt = 0;
  /**
   * How long an identical sentence is considered a duplicate rather than a
   * fresh request.
   *
   * Machine-triggered repeats arrive within milliseconds of each other (React
   * runs effects twice in development, and a command's reply is announced by
   * both the handler and its caller). A candidate asking to hear a question
   * again needs at least a second to say so.
   */
  private static readonly REPEAT_SUPPRESSION_MS = 1000;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  public onSpeechStart(cb: () => void): () => void {
    this.speechStartListeners.add(cb);
    return () => {
      this.speechStartListeners.delete(cb);
    };
  }

  public onSpeechEnd(cb: () => void): () => void {
    this.speechEndListeners.add(cb);
    return () => {
      this.speechEndListeners.delete(cb);
    };
  }

  private notifySpeechStart() {
    this.internalSpeaking = true;
    this.speechStartListeners.forEach((cb) => cb());
  }

  private notifySpeechEnd() {
    this.internalSpeaking = false;
    this.activeUtterance = null;
    if (typeof window !== 'undefined') {
      (window as any)._dristixActiveUtterance = null;
    }
    this.lastSpeechEndTime = Date.now();
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.speechEndListeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.warn('Speech end listener error:', err);
      }
    });
  }

  private loadVoices() {
    if (!this.synth) return;
    try {
      this.voices = this.synth.getVoices();
    } catch {
      // fallback
    }
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && this.synth) {
      this.voices = this.synth.getVoices();
    }
    return this.voices;
  }

  /**
   * Finds the best voice for Hindi (Devanagari), prioritizing Microsoft Edge hi-IN-MadhurNeural
   */
  public findMadhurVoice(): SpeechSynthesisVoice | null {
    const list = this.getVoices();
    // 1. Exact or fuzzy match for Madhur Neural (Microsoft Edge / Azure)
    const madhur = list.find((v) => {
      const uri = (v.voiceURI || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      return (
        uri === 'hi-in-madhurneural' ||
        uri.includes('madhur') ||
        name.includes('madhur')
      );
    });
    if (madhur) return madhur;

    // 2. Any other Hindi Natural / Neural voice
    const naturalHindi = list.find((v) => {
      const l = (v.lang || '').toLowerCase();
      const n = (v.name || '').toLowerCase();
      return (l.startsWith('hi') || l === 'hi-in') && (n.includes('natural') || n.includes('neural') || n.includes('online'));
    });
    if (naturalHindi) return naturalHindi;

    // 3. Any Hindi voice
    const anyHindi = list.find((v) => {
      const l = (v.lang || '').toLowerCase();
      const n = (v.name || '').toLowerCase();
      return l.startsWith('hi') || l === 'hi-in' || n.includes('hindi');
    });
    if (anyHindi) return anyHindi;

    // 4. Fallback to Indian English Neerja
    return this.findNeerjaVoice();
  }

  /**
   * Finds the best voice for Hinglish (Roman Hindi), prioritizing Microsoft Edge en-IN-NeerjaNeural
   */
  public findNeerjaVoice(): SpeechSynthesisVoice | null {
    const list = this.getVoices();
    // 1. Exact or fuzzy match for Neerja Neural (Microsoft Edge / Azure)
    const neerja = list.find((v) => {
      const uri = (v.voiceURI || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      return (
        uri === 'en-in-neerjaneural' ||
        uri.includes('neerja') ||
        name.includes('neerja')
      );
    });
    if (neerja) return neerja;

    // 2. Any other Indian English Natural / Neural voice
    const naturalEnIn = list.find((v) => {
      const l = (v.lang || '').toLowerCase();
      const n = (v.name || '').toLowerCase();
      return l === 'en-in' && (n.includes('natural') || n.includes('neural') || n.includes('online'));
    });
    if (naturalEnIn) return naturalEnIn;

    // 3. Any Indian English voice
    const anyEnIn = list.find((v) => {
      const l = (v.lang || '').toLowerCase();
      const n = (v.name || '').toLowerCase();
      return l === 'en-in' || n.includes('india');
    });
    if (anyEnIn) return anyEnIn;

    // 4. Fallback to English Ava voice
    return this.findAvaVoice();
  }

  public findHinglishVoice(): SpeechSynthesisVoice | null {
    return this.findNeerjaVoice();
  }

  public findHindiVoice(): SpeechSynthesisVoice | null {
    return this.findMadhurVoice();
  }

  public findEnglishVoice(): SpeechSynthesisVoice | null {
    return this.findAvaVoice();
  }

  /**
   * Finds the best voice for English (Default), prioritizing Microsoft Edge en-US-AvaMultilingualNeural
   */
  public findAvaVoice(): SpeechSynthesisVoice | null {
    const list = this.getVoices();
    // 1. Exact or fuzzy match for Ava Multilingual Neural (Microsoft Edge / Azure)
    const ava = list.find((v) => {
      const uri = (v.voiceURI || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      return (
        uri === 'en-us-avamultilingualneural' ||
        uri.includes('avamultilingual') ||
        uri.includes('ava') ||
        name.includes('avamultilingual') ||
        name.includes('ava')
      );
    });
    if (ava) return ava;

    // 2. Any other English Natural / Neural / Multilingual voice
    const naturalEn = list.find((v) => {
      const l = (v.lang || '').toLowerCase();
      const n = (v.name || '').toLowerCase();
      return l.startsWith('en') && (n.includes('natural') || n.includes('neural') || n.includes('online') || n.includes('multilingual'));
    });
    if (naturalEn) return naturalEn;

    // 3. Any en-US voice
    const anyEnUs = list.find((v) => {
      const l = (v.lang || '').toLowerCase();
      return l === 'en-us';
    });
    if (anyEnUs) return anyEnUs;

    // 4. Any English voice
    return list.find((v) => (v.lang || '').toLowerCase().startsWith('en')) || null;
  }

  /**
   * Resolves the target voice and language for a given clean text string
   */
  public resolveVoiceForText(cleanText: string): {
    voice: SpeechSynthesisVoice | null;
    lang: 'hi-IN' | 'en-IN' | 'en-US';
    modality: SpeechModality;
    voiceId: string;
  } {
    const det = detectLanguage(cleanText);

    // If candidate or admin has explicitly set a voice
    if (this.selectedVoiceURI) {
      const uri = this.selectedVoiceURI.toLowerCase();
      if (uri === EDGE_TTS_VOICES.HINDI.toLowerCase() || uri.includes('madhur')) {
        return {
          voice: this.findMadhurVoice(),
          lang: 'hi-IN',
          modality: 'hindi',
          voiceId: EDGE_TTS_VOICES.HINDI,
        };
      }
      if (uri === EDGE_TTS_VOICES.HINGLISH.toLowerCase() || uri.includes('neerja')) {
        return {
          voice: this.findNeerjaVoice(),
          lang: 'en-IN',
          modality: 'hinglish',
          voiceId: EDGE_TTS_VOICES.HINGLISH,
        };
      }
      if (uri === EDGE_TTS_VOICES.ENGLISH.toLowerCase() || uri.includes('ava')) {
        return {
          voice: this.findAvaVoice(),
          lang: 'en-US',
          modality: 'english',
          voiceId: EDGE_TTS_VOICES.ENGLISH,
        };
      }

      // Check if it's a specific installed system voice
      const exactVoice = this.getVoices().find((v) => v.voiceURI === this.selectedVoiceURI);
      if (exactVoice) {
        return {
          voice: exactVoice,
          lang: (exactVoice.lang as any) || det.lang,
          modality: det.modality,
          voiceId: exactVoice.voiceURI,
        };
      }
    }

    // Default: Intelligent auto-routing based on text modality
    if (det.modality === 'hindi') {
      return {
        voice: this.findMadhurVoice(),
        lang: 'hi-IN',
        modality: 'hindi',
        voiceId: EDGE_TTS_VOICES.HINDI,
      };
    }

    if (det.modality === 'hinglish') {
      return {
        voice: this.findNeerjaVoice(),
        lang: 'en-IN',
        modality: 'hinglish',
        voiceId: EDGE_TTS_VOICES.HINGLISH,
      };
    }

    return {
      voice: this.findAvaVoice(),
      lang: 'en-US',
      modality: 'english',
      voiceId: EDGE_TTS_VOICES.ENGLISH,
    };
  }

  /**
   * Helper to inspect which Microsoft Edge Natural voices are installed in browser
   */
  public getEdgeVoiceStatus() {
    const list = this.getVoices();
    const madhur = list.find((v) => (v.voiceURI || '').toLowerCase().includes('madhur') || (v.name || '').toLowerCase().includes('madhur')) || null;
    const neerja = list.find((v) => (v.voiceURI || '').toLowerCase().includes('neerja') || (v.name || '').toLowerCase().includes('neerja')) || null;
    const ava = list.find((v) => (v.voiceURI || '').toLowerCase().includes('ava') || (v.name || '').toLowerCase().includes('ava')) || null;

    return {
      madhur,
      neerja,
      ava,
      hasAllEdgeVoices: !!(madhur && neerja && ava),
      hasAnyEdgeVoice: !!(madhur || neerja || ava),
    };
  }

  public stop(notify = true) {
    // Abandon any speak() still waiting out its start delay.
    this.speakGeneration++;
    if (this.pendingSpeakTimer) {
      clearTimeout(this.pendingSpeakTimer);
      this.pendingSpeakTimer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.activeUtterance = null;
    if (typeof window !== 'undefined') {
      (window as any)._dristixActiveUtterance = null;
    }

    // Chrome Web Speech API cancel guard: if paused, resume before cancel to avoid freeze
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel();
      } catch {}
    }

    this.internalSpeaking = false;
    this.lastSpeechEndTime = Date.now();

    if (notify) {
      this.interruptedAt = Date.now();
      this.notifySpeechEnd();
    }
  }

  public pause() {
    if (this.synth) {
      this.synth.pause();
    }
  }

  public resume() {
    if (this.synth) {
      this.synth.resume();
    }
  }

  public isSpeaking(): boolean {
    return this.internalSpeaking || Boolean(this.activeUtterance);
  }

  /**
   * True when the speech that just ended was cut short from outside — an
   * explicit stop, or a newer announcement taking over — rather than reaching
   * its own end.
   *
   * Only meaningful when read straight from an `onSpeechEnd` callback, which is
   * when listeners ask the question.
   */
  public wasInterrupted(): boolean {
    return this.interruptedAt > 0 && Date.now() - this.interruptedAt < 5000;
  }

  /**
   * Returns true if assistant is actively speaking OR finished speaking less than 850ms ago.
   * Prevents microphone from picking up acoustic reflections/room echo from laptop speakers.
   */
  public isEchoGuardActive(): boolean {
    if (this.isSpeaking()) return true;
    return Date.now() - this.lastSpeechEndTime < 1100;
  }

  /**
   * Checks if candidate recognized transcript is an acoustic echo of what the assistant spoke aloud.
   */
  public isTextEcho(candidateText: string): boolean {
    if (!candidateText || !this.lastSpokenText) return false;

    // Acoustic speaker echo can only occur if assistant is currently speaking or spoke within 2500ms
    const isRecentlySpeaking = this.internalSpeaking || (Date.now() - this.lastSpeechEndTime < 2500);
    if (!isRecentlySpeaking) {
      return false;
    }

    const normCand = candidateText.toLowerCase().replace(/[^\w\s\u0900-\u097F]/gi, '').trim();
    const normSpoken = this.lastSpokenText.toLowerCase().replace(/[^\w\s\u0900-\u097F]/gi, '').trim();
    if (!normCand || !normSpoken) return false;

    // 1. Direct match: identical text
    if (normSpoken === normCand) return true;

    // 2. Substring match: recognized text is contained in what was just spoken
    // (e.g. assistant said "You can say Start SSC CGL" and mic heard "Start SSC CGL")
    if (normSpoken.includes(normCand) && normCand.length >= 4) return true;
    if (normCand.includes(normSpoken) && normSpoken.length >= 4) return true;

    // 3. Word overlap: if candidate words appear heavily in spoken reply
    const timeSinceSpoken = Date.now() - this.lastSpeechEndTime;
    const candWords = normCand.split(/\s+/).filter((w) => w.length > 2);
    if (candWords.length >= 2) {
      const matchWords = candWords.filter((w) => normSpoken.includes(w));
      const overlapThreshold = timeSinceSpoken < 1200 ? 0.50 : 0.75;
      if (matchWords.length / candWords.length >= overlapThreshold) return true;
    }

    return false;
  }

  public speak(text: string, interrupt = true) {
    if (!this.enabled || typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) return;

    this.synth = window.speechSynthesis;

    // Clean HTML tags, normalize whitespace, and verbalize ratios (e.g. 3:1 -> 3 to 1), math symbols, abbreviations
    const cleanText = verbalizeForSpeech(text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
    if (!cleanText) {
      this.notifySpeechEnd();
      return;
    }

    // Decide this before touching anything: an interrupting repeat would cancel
    // the utterance already playing and then play itself, which is precisely
    // the double-speech this guards against. Duplicates arrive either while the
    // first copy is still going (two call sites announcing the same action) or
    // within a few milliseconds of it finishing (a development-mode effect
    // running twice). A candidate asking for a question again needs a second to
    // say so, so neither window swallows a genuine repeat.
    const now = Date.now();
    const isRepeat =
      cleanText.toLowerCase() === this.lastSpokenText &&
      (this.internalSpeaking || now - this.lastSpokenAt < SpeechEngine.REPEAT_SUPPRESSION_MS);
    if (isRepeat) {
      return;
    }

    // Fix Chrome bug: if paused or stuck, resume first
    if (this.synth.paused) {
      try {
        this.synth.resume();
      } catch {}
    }

    if (interrupt) {
      this.stop(false);
    } else if (this.internalSpeaking) {
      return;
    }

    this.lastSpokenText = cleanText.toLowerCase();
    this.lastSpokenAt = now;
    // This announcement is the live one now; a stop that ended the previous
    // one no longer describes the current state.
    this.interruptedAt = 0;

    if (this.voices.length === 0) {
      this.loadVoices();
    }

    const resolved = this.resolveVoiceForText(cleanText);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    this.activeUtterance = utterance;
    // Retain global reference to protect against Chromium V8 garbage collection bug
    (window as any)._dristixActiveUtterance = utterance;

    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.lang = resolved.lang;

    if (resolved.voice) {
      utterance.voice = resolved.voice;
    }

    utterance.onstart = () => {
      this.notifySpeechStart();
    };

    utterance.onend = () => {
      this.notifySpeechEnd();
    };

    utterance.onerror = (e: any) => {
      // Normal browser cancellation when new utterance preempts previous utterance
      if (e?.error === 'canceled' || e?.error === 'interrupted') {
        return;
      }
      console.warn('SpeechSynthesis error:', e?.error || e);
      if (this.synth && this.synth.paused) {
        try {
          this.synth.resume();
        } catch {}
      }
      this.notifySpeechEnd();
    };

    // Chrome Watchdog: compute dynamic duration limit so speech never gets stuck indefinitely
    const wordCount = cleanText.split(/\s+/).length;
    const estimatedDurationMs = Math.max(2500, (wordCount / (2.2 * this.rate) + 2.5) * 1000);

    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
    }
    this.watchdogTimer = setTimeout(() => {
      if (this.internalSpeaking) {
        this.notifySpeechEnd();
      }
    }, estimatedDurationMs);

    // Report as speaking from the moment we commit to it, not from `onstart`.
    //
    // `onstart` only fires once `synth.speak()` runs — 40ms later at the
    // earliest, often far longer. Every call site that guards a second
    // announcement with `isSpeaking()` was therefore reading `false` at exactly
    // the moment it mattered, so the guard never guarded.
    this.internalSpeaking = true;

    const generation = ++this.speakGeneration;

    // Small delay prevents Chrome cancel() race condition
    this.pendingSpeakTimer = setTimeout(() => {
      this.pendingSpeakTimer = null;
      // stop() ran while this was queued; the utterance it was about to play
      // has been cancelled, so playing it now would be a ghost repeat.
      if (generation !== this.speakGeneration) return;
      if (this.synth) {
        if (this.synth.paused) {
          try {
            this.synth.resume();
          } catch {}
        }
        try {
          this.synth.speak(utterance);
        } catch (err) {
          console.warn('SpeechSynthesis speak failed:', err);
          this.notifySpeechEnd();
        }
      }
    }, 40);
  }
}

export const speechEngine = new SpeechEngine();

