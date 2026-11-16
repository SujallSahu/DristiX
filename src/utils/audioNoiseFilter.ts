/**
 * Audio Noise Filter & Acoustic Echo Suppression Manager
 *
 * Activates browser-level and hardware-accelerated Acoustic Echo Cancellation (AEC),
 * Noise Suppression (NS), and Automatic Gain Control (AGC).
 *
 * Utilizes a Web Audio API bandpass/high-pass biquad filter and RMS energy analyzer
 * to establish an adaptive noise floor gate. Filters out background ambient sounds
 * (fan hum, typing clicks, AC rumble, distant voices) and detects real human speech.
 */

export interface AudioNoiseStats {
  volume: number; // Normalized 0 to 1 for visualizer
  isSpeech: boolean; // True when audio energy exceeds the adaptive noise gate
  noiseFloor: number; // Current baseline ambient room noise level
  isHardwareFiltered: boolean; // True when browser DSP echo/noise suppression is active
}

export interface NoiseFilteredPipeline {
  filteredStream: MediaStream;
  analyser: AnalyserNode;
  gainNode: GainNode;
  highPassFilter: BiquadFilterNode;
  notchFilter: BiquadFilterNode;
  lowPassFilter: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  cleanup: () => void;
}

type AudioStatsCallback = (stats: AudioNoiseStats) => void;

class AudioNoiseFilterService {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private biquadFilter: BiquadFilterNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;
  private listeners: Set<AudioStatsCallback> = new Set();

  // Adaptive noise floor tracking
  private currentNoiseFloor: number = 0.015;
  private speechThresholdMargin: number = 0.025;
  private consecutiveSpeechFrames: number = 0;
  private lastSpeechTimestamp: number = 0;
  private isHardwareEnabled: boolean = false;

  /**
   * Initializes hardware noise cancellation and Web Audio noise filter.
   */
  public async start(): Promise<boolean> {
    if (this.isRunning && this.mediaStream) {
      return true;
    }

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      // 1. Request OS/driver-level acoustic echo cancellation and noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
        },
      });

      this.mediaStream = stream;
      this.isHardwareEnabled = true;

      // 2. Initialize Web Audio API pipeline
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        this.isRunning = true;
        return true;
      }

      this.audioContext = new AudioCtxClass();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // 3. High-Pass Filter: Cuts out sub-audible mechanical rumblings, fan hum, and table thuds (< 90Hz)
      this.biquadFilter = this.audioContext.createBiquadFilter();
      this.biquadFilter.type = 'highpass';
      this.biquadFilter.frequency.setValueAtTime(90, this.audioContext.currentTime);
      this.biquadFilter.Q.setValueAtTime(0.707, this.audioContext.currentTime);

      // 4. Analyser Node for measuring RMS energy
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;

      // Pipeline: Source -> HighPass Filter -> Analyser (Do NOT connect to destination to avoid speaker feedback)
      this.sourceNode.connect(this.biquadFilter);
      this.biquadFilter.connect(this.analyser);

      this.isRunning = true;
      this.startAnalysisLoop();
      return true;
    } catch (err) {
      console.warn('[AudioNoiseFilter] Could not start hardware audio filter:', err);
      this.isHardwareEnabled = false;
      return false;
    }
  }

  /**
   * Continuous loop measuring audio levels and computing adaptive noise floor.
   */
  private startAnalysisLoop() {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const checkLevel = () => {
      if (!this.isRunning || !this.analyser) return;

      this.analyser.getByteTimeDomainData(dataArray);

      // Calculate Root Mean Square (RMS) amplitude
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rawRms = Math.sqrt(sumSquares / dataArray.length);

      // Adaptive noise floor tracking: slowly adapt baseline to ambient room sound
      if (rawRms < this.currentNoiseFloor) {
        this.currentNoiseFloor = this.currentNoiseFloor * 0.95 + rawRms * 0.05;
      } else {
        this.currentNoiseFloor = this.currentNoiseFloor * 0.999 + rawRms * 0.001;
      }
      // Clamp noise floor between 0.005 and 0.08
      this.currentNoiseFloor = Math.max(0.005, Math.min(0.08, this.currentNoiseFloor));

      // Voice Activity Detection (VAD) condition
      const speechCutoff = this.currentNoiseFloor + this.speechThresholdMargin;
      const isOverThreshold = rawRms > speechCutoff && rawRms > 0.025;

      if (isOverThreshold) {
        this.consecutiveSpeechFrames++;
      } else {
        this.consecutiveSpeechFrames = Math.max(0, this.consecutiveSpeechFrames - 2);
      }

      // Candidate must sustain speech for at least 2 consecutive analysis frames (~30ms)
      const isSpeech = this.consecutiveSpeechFrames >= 2;
      if (isSpeech) {
        this.lastSpeechTimestamp = Date.now();
      }

      // Visual volume level normalized 0 to 1
      const normalizedVolume = Math.min(1, Math.max(0, (rawRms - this.currentNoiseFloor) * 12));

      const stats: AudioNoiseStats = {
        volume: normalizedVolume,
        isSpeech: isSpeech || (Date.now() - this.lastSpeechTimestamp < 450),
        noiseFloor: this.currentNoiseFloor,
        isHardwareFiltered: this.isHardwareEnabled,
      };

      for (const listener of this.listeners) {
        try {
          listener(stats);
        } catch {}
      }

      this.animationFrameId = requestAnimationFrame(checkLevel);
    };

    this.animationFrameId = requestAnimationFrame(checkLevel);
  }

  /**
   * Subscribe to real-time audio statistics for visualizer & voice gating.
   */
  public addListener(cb: AudioStatsCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * Returns whether human speech was recently detected above the background noise floor.
   */
  public isSpeechActive(): boolean {
    return Date.now() - this.lastSpeechTimestamp < 600;
  }

  /**
   * Constructs a high-performance Web Audio DSP noise cancellation and voice enhancement pipeline.
   *
   * 1. High-Pass Filter (85Hz): Cuts sub-audible table thuds, fan drone, HVAC hum, and breath pops.
   * 2. Notch Filter (50Hz): Eliminates electrical mains hum.
   * 3. Low-Pass Filter (7500Hz): Eliminates high-frequency hissing and RF static.
   * 4. Dynamics Compressor: Smooths vocal volume, boosts quiet speech, prevents clipping.
   * 5. Gain Node: Provides instant software-level muting during TTS speech or earcon output.
   * 6. MediaStreamDestination: Feeds clean, noise-suppressed studio audio to MediaRecorder.
   */
  public createNoiseFilteredPipeline(
    audioCtx: AudioContext,
    inputStream: MediaStream
  ): NoiseFilteredPipeline {
    const source = audioCtx.createMediaStreamSource(inputStream);

    // 1. High-pass filter: cut frequencies < 85Hz
    const highPass = audioCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(85, audioCtx.currentTime);
    highPass.Q.setValueAtTime(0.707, audioCtx.currentTime);

    // 2. 50Hz notch filter: eliminate AC power hum
    const notch = audioCtx.createBiquadFilter();
    notch.type = 'notch';
    notch.frequency.setValueAtTime(50, audioCtx.currentTime);
    notch.Q.setValueAtTime(4.0, audioCtx.currentTime);

    // 3. Low-pass filter: cut frequencies > 7500Hz
    const lowPass = audioCtx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.setValueAtTime(7500, audioCtx.currentTime);
    lowPass.Q.setValueAtTime(0.707, audioCtx.currentTime);

    // 4. Dynamics Compressor for vocal clarity
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
    compressor.knee.setValueAtTime(30, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

    // 5. Gain node for instant acoustic echo mute guard
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);

    // 6. MediaStreamDestination for MediaRecorder
    const dest = audioCtx.createMediaStreamDestination();

    // 7. Analyser for speech volume and VAD
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;

    // Connect DSP chain:
    // source -> highPass -> notch -> lowPass -> compressor -> gainNode -> dest
    // gainNode -> analyser (Do NOT connect to audioCtx.destination to prevent speaker loopback)
    source.connect(highPass);
    highPass.connect(notch);
    notch.connect(lowPass);
    lowPass.connect(compressor);
    compressor.connect(gainNode);
    gainNode.connect(dest);
    gainNode.connect(analyser);

    const cleanup = () => {
      try {
        source.disconnect();
        highPass.disconnect();
        notch.disconnect();
        lowPass.disconnect();
        compressor.disconnect();
        gainNode.disconnect();
        analyser.disconnect();
      } catch {}
    };

    return {
      filteredStream: dest.stream,
      analyser,
      gainNode,
      highPassFilter: highPass,
      notchFilter: notch,
      lowPassFilter: lowPass,
      compressor,
      cleanup,
    };
  }

  /**
   * Stops audio stream and cleans up audio context.
   */
  public stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        void this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.analyser = null;
    this.biquadFilter = null;
    this.sourceNode = null;
    this.consecutiveSpeechFrames = 0;
  }
}

export const audioNoiseFilter = new AudioNoiseFilterService();

