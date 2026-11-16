/**
 * Accessible Audio Engine (Earcons & Auditory Cues)
 * Uses Web Audio API without requiring any external mp3 files.
 */

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  private activeSoundCount = 0;
  private lastSoundEndTime = 0;
  private soundStartListeners: Set<() => void> = new Set();
  private soundEndListeners: Set<() => void> = new Set();

  public isPlaying(): boolean {
    return this.activeSoundCount > 0;
  }

  public isEchoGuardActive(): boolean {
    return this.isPlaying() || Date.now() - this.lastSoundEndTime < 300;
  }

  public onSoundStart(cb: () => void): () => void {
    this.soundStartListeners.add(cb);
    return () => this.soundStartListeners.delete(cb);
  }

  public onSoundEnd(cb: () => void): () => void {
    this.soundEndListeners.add(cb);
    return () => this.soundEndListeners.delete(cb);
  }

  private notifySoundStart() {
    this.activeSoundCount++;
    this.soundStartListeners.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
  }

  private notifySoundEnd(delayMs: number) {
    setTimeout(() => {
      this.activeSoundCount = Math.max(0, this.activeSoundCount - 1);
      if (this.activeSoundCount === 0) {
        this.lastSoundEndTime = Date.now();
        this.soundEndListeners.forEach((cb) => {
          try {
            cb();
          } catch {}
        });
      }
    }, Math.max(20, delayMs));
  }

  public initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public unlock() {
    this.initCtx();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Soft tone generator
  private playTone(frequency: number, type: OscillatorType, duration: number, gainValue = 0.22) {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      this.notifySoundStart();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
      this.notifySoundEnd(duration * 1000 + 40);
    } catch {
      // Audio playback failsafe
    }
  }

  // Earcon: Navigation (Next / Previous)
  playNavigate() {
    this.playTone(440, 'sine', 0.08, 0.2); // A4
  }

  // Earcon: Option Selected (1, 2, 3, 4)
  playSelect() {
    this.playTone(660, 'sine', 0.1, 0.25); // E5
  }

  // Earcon: Marked for Review (Chime)
  playMark() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      this.notifySoundStart();
      const now = this.ctx.currentTime;
      [523.25, 659.25].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.22, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.12);
      });
      this.notifySoundEnd(240);
    } catch {
      // safe fallback
    }
  }

  // Earcon: Clear Selection
  playClear() {
    this.playTone(330, 'triangle', 0.12, 0.2);
  }

  // Earcon: Microphone Started Listening (Ascending double chime)
  playMicStart() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      this.notifySoundStart();
      const now = this.ctx.currentTime;
      [523.25, 783.99].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.25, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.14);
      });
      this.notifySoundEnd(280);
    } catch {}
  }

  // Earcon: Microphone Paused/Stopped (Descending gentle chime)
  playMicStop() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      this.notifySoundStart();
      const now = this.ctx.currentTime;
      [659.25, 440].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.18, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.12);
      });
      this.notifySoundEnd(240);
    } catch {}
  }

  // Earcon: Timer Milestone Alert
  playTimerAlert() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      this.notifySoundStart();
      const now = this.ctx.currentTime;
      [880, 880, 880].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);
        gain.gain.setValueAtTime(0.25, now + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.1);
      });
      this.notifySoundEnd(480);
    } catch {
      // safe fallback
    }
  }

  // Earcon: Submission Celebration Fanfare
  playSuccess() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      this.notifySoundStart();
      const now = this.ctx.currentTime;
      [440, 554.37, 659.25, 880].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.25, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.25);
      });
      this.notifySoundEnd(620);
    } catch {
      // safe fallback
    }
  }
}

export const soundEffects = new SoundEffectsEngine();

// Auto-unlock audio context on user interaction to comply with modern browser autoplay policies
if (typeof window !== 'undefined') {
  const handleInteraction = () => {
    soundEffects.unlock();
  };
  window.addEventListener('click', handleInteraction, { passive: true, once: true });
  window.addEventListener('keydown', handleInteraction, { passive: true, once: true });
  window.addEventListener('touchstart', handleInteraction, { passive: true, once: true });
}
