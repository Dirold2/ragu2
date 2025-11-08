import { Transform } from "stream"

export interface AudioProcessingOptions {
	volume: number;
	bass: number;
	treble: number;
	compressor: boolean;
	normalize: boolean;
	headers?: Record<string, string>;
	lowPassFrequency?: number;
	lowPassQ?: number;
	fade?: {
		fadein: number;
		fadeout: number;
	};
}

export const VOLUME_MIN = 0;
export const VOLUME_MAX = 1;
export const BASS_MIN = -20;
export const BASS_MAX = 20;
export const TREBLE_MIN = -20;
export const TREBLE_MAX = 20;


/**
 * Audio filter state for IIR filters.
 */
interface FilterState {
  trebleL: number
  trebleR: number
  bass60L: number
  bass60R: number
  bass120L: number
  bass120R: number
  bassLowpassL: number
  bassLowpassR: number
}

/**
 * Sample rate for audio processing (48kHz).
 */
const SAMPLE_RATE = 48000

/**
 * Convert user value [-1, 1] to linear gain using dB curve.
 */
function userToGainLinear(userVal: number, maxDb = 12): number {
  const v = Math.max(-1, Math.min(1, userVal))
  const db = Math.sign(v) * Math.pow(Math.abs(v), 0.5) * maxDb
  return Math.pow(10, db / 20)
}

/**
 * Convert user value [-1, 1] to dB with soft curve.
 */
function userToGainDb(userVal: number, maxDb = 15): number {
  const v = Math.max(-1, Math.min(1, userVal))
  return Math.sign(v) * Math.pow(Math.abs(v), 0.5) * maxDb
}

/**
 * Simple dynamic range compressor.
 */
function compressSample(value: number, threshold = 0.8, ratio = 4): number {
  const abs = Math.abs(value)
  if (abs <= threshold) return value
  const excess = abs - threshold
  const compressed = threshold + excess / ratio
  return Math.sign(value) * compressed
}

/**
 * Real-time audio processor with dynamic effects.
 *
 * Processes PCM audio samples with volume control, EQ, and compression.
 * All effects are applied in real-time without restarting the stream.
 *
 * @example
 * \`\`\`typescript
 * const processor = new AudioProcessor({ volume: 0.5, bass: 0.2, treble: 0.1 });
 *
 * // Pipe FFmpeg output through processor
 * ffmpegOutput.pipe(processor).pipe(destination);
 *
 * // Adjust effects in real-time
 * processor.setVolume(0.8);
 * processor.setEqualizer(0.5, 0.3, true);
 * \`\`\`
 */
export class AudioProcessor extends Transform {
  private volume: number
  private bass: number
  private treble: number
  private compressor: boolean
  private isFading = false
  private lastVolume: number
  private isDestroyed = false

  // Fade state
  private fadeStartTime: number | null = null
  private fadeDuration = 0
  private fadeFrom = 0
  private fadeTo = 0

  // Filter states
  private filterState: FilterState = {
    trebleL: 0,
    trebleR: 0,
    bass60L: 0,
    bass60R: 0,
    bass120L: 0,
    bass120R: 0,
    bassLowpassL: 0,
    bassLowpassR: 0,
  }

  constructor(options: AudioProcessingOptions) {
    super()
    this.volume = this.clampVolume(options.volume)
    this.lastVolume = this.volume
    this.bass = this.normalizeBass(options.bass)
    this.treble = this.normalizeTreble(options.treble)
    this.compressor = !!options.compressor

    this.setupEventHandlers()
  }

  // ==================== Public API ====================

  /**
   * Set volume instantly.
   */
  setVolume(volume: number): void {
    if (this.isDestroyed) return
    this.lastVolume = this.volume
    this.volume = this.clampVolume(volume)
  }

  /**
   * Fade volume smoothly over duration.
   */
  startFade(targetVolume: number, duration: number): void {
    if (this.isDestroyed) return
    this.isFading = true
    this.fadeFrom = this.volume
    this.fadeTo = this.clampVolume(targetVolume)
    this.fadeStartTime = Date.now()
    this.fadeDuration = duration
  }

  /**
   * Update equalizer settings (bass, treble, compression).
   */
  setEqualizer(bass: number, treble: number, compressor: boolean): void {
    if (this.isDestroyed) return
    this.bass = this.normalizeBass(bass)
    this.treble = this.normalizeTreble(treble)
    this.compressor = compressor
  }

  /**
   * Enable or disable dynamic range compression.
   */
  setCompressor(enabled: boolean): void {
    if (this.isDestroyed) return
    this.compressor = enabled
  }

  // ==================== Stream Processing ====================

  _transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null, data?: any) => void): void {
    if (this.isDestroyed || this.destroyed) {
      callback()
      return
    }

    try {
      this.updateFadeVolume()

      const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2)

      const frameCount = samples.length / 2
      const volumeDelta = this.volume - this.lastVolume
      const volumeStep = frameCount > 0 ? volumeDelta / frameCount : 0

      for (let frame = 0; frame < frameCount; frame++) {
        const idx = frame * 2
        const left = samples[idx]
        const right = samples[idx + 1] ?? left
        const currentVolume = this.lastVolume + volumeStep * frame

        const [processedLeft, processedRight] = this.processAudioSample(left, right, currentVolume)

        samples[idx] = processedLeft
        samples[idx + 1] = processedRight
      }

      this.lastVolume = this.volume
      callback(null, chunk)
    } catch (error) {
      console.error("[AudioProcessor] Transform error:", error)
      this.safeDestroy()
      callback()
    }
  }

  // ==================== Audio Processing ====================

  /**
   * Process a single stereo audio sample with all effects.
   */
  private processAudioSample(left: number, right: number, currentVolume: number): [number, number] {
    // Convert to normalized float [-1, 1]
    let l = left / 32768
    let r = right / 32768

    // Apply volume
    l *= currentVolume
    r *= currentVolume

    // Apply bass boost/cut
    if (Math.abs(this.bass) > 0.001) {
      ;[l, r] = this.applyBassFilter(l, r)
    }

    // Apply treble boost/cut
    if (Math.abs(this.treble) > 0.001) {
      ;[l, r] = this.applyTrebleFilter(l, r)
    }

    // Apply compression
    if (this.compressor) {
      l = compressSample(l)
      r = compressSample(r)
    }

    // Clamp and convert back to int16
    l = Math.max(-1, Math.min(1, l))
    r = Math.max(-1, Math.min(1, r))

    return [Math.round(l * 32767), Math.round(r * 32767)]
  }

  /**
   * Apply bass filter with multi-stage processing.
   */
  private applyBassFilter(l: number, r: number): [number, number] {
    const bassGainDb = userToGainDb(this.bass, 18)

    // Calculate adaptive lowpass frequency
    const lowpassFreq =
      bassGainDb >= 0
        ? 4000 - (bassGainDb / 18) * 110 // 4000-3890 Hz
        : 4000 + (Math.abs(bassGainDb) / 18) * 1000 // 4000-5000 Hz

    // Calculate adaptive Q-factor
    const lowpassQ =
      bassGainDb >= 0
        ? 0.7 + (bassGainDb / 18) * 1.8 // 0.7-2.5
        : 0.7 - (Math.abs(bassGainDb) / 18) * 0.4 // 0.7-0.3

    // Stage 1: 60Hz bass filter
    const bassGain60 = userToGainLinear(this.bass * 0.7, 18)
    const alpha60 = (2 * Math.PI * 60) / SAMPLE_RATE

    this.filterState.bass60L += alpha60 * (l - this.filterState.bass60L)
    this.filterState.bass60R += alpha60 * (r - this.filterState.bass60R)

    l += this.filterState.bass60L * (bassGain60 - 1)
    r += this.filterState.bass60R * (bassGain60 - 1)

    // Stage 2: 120Hz equalizer
    const eqGain120 = userToGainLinear(this.bass * 0.5, 18)
    const alpha120 = (2 * Math.PI * 120) / SAMPLE_RATE

    this.filterState.bass120L += alpha120 * (l - this.filterState.bass120L)
    this.filterState.bass120R += alpha120 * (r - this.filterState.bass120R)

    l += this.filterState.bass120L * (eqGain120 - 1)
    r += this.filterState.bass120R * (eqGain120 - 1)

    // Stage 3: Adaptive lowpass with Q-factor
    const effectiveAlpha = (2 * Math.PI * lowpassFreq) / SAMPLE_RATE
    const qInfluence = Math.min(lowpassQ * 0.5, 0.95)

    this.filterState.bassLowpassL =
      this.filterState.bassLowpassL * (1 - effectiveAlpha * qInfluence) + l * effectiveAlpha * qInfluence
    this.filterState.bassLowpassR =
      this.filterState.bassLowpassR * (1 - effectiveAlpha * qInfluence) + r * effectiveAlpha * qInfluence

    const blendFactor = 0.3 + (lowpassQ - 0.7) * 0.2
    l = this.filterState.bassLowpassL + (l - this.filterState.bassLowpassL) * blendFactor
    r = this.filterState.bassLowpassR + (r - this.filterState.bassLowpassR) * blendFactor

    // Stage 4: Limiter for high bass gain
    if (Math.abs(bassGainDb) > 6) {
      l = this.applyLimiter(l)
      r = this.applyLimiter(r)
    }

    return [l, r]
  }

  /**
   * Apply treble filter (high-shelf simulation).
   */
  private applyTrebleFilter(l: number, r: number): [number, number] {
    const trebleGain = userToGainLinear(this.treble, 12)
    const alphaTreble = (2 * Math.PI * 4000) / SAMPLE_RATE

    // Low-pass to derive high-pass component
    const lpStateL = this.filterState.trebleL + alphaTreble * (l - this.filterState.trebleL)
    const lpStateR = this.filterState.trebleR + alphaTreble * (r - this.filterState.trebleR)

    const highPassL = l - lpStateL
    const highPassR = r - lpStateR

    this.filterState.trebleL = lpStateL
    this.filterState.trebleR = lpStateR

    // Boost/cut high frequencies
    l += highPassL * (trebleGain - 1)
    r += highPassR * (trebleGain - 1)

    return [l, r]
  }

  /**
   * Apply simple limiter to prevent clipping.
   */
  private applyLimiter(value: number, threshold = 0.85, ratio = 8): number {
    const abs = Math.abs(value)
    if (abs <= threshold) return value
    const excess = abs - threshold
    const compressed = threshold + excess / ratio
    return Math.sign(value) * compressed
  }

  // ==================== Utilities ====================

  private updateFadeVolume(): void {
    if (!this.isFading || this.fadeStartTime === null) return

    const elapsed = Date.now() - this.fadeStartTime

    if (elapsed >= this.fadeDuration) {
      this.volume = this.fadeTo
      this.isFading = false
      this.fadeStartTime = null
    } else {
      const progress = elapsed / this.fadeDuration
      this.volume = this.fadeFrom + (this.fadeTo - this.fadeFrom) * progress
    }
  }

  private clampVolume(volume: number): number {
    return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, volume))
  }

  private normalizeBass(bass: number): number {
    const range = BASS_MAX - BASS_MIN
    if (range === 0) return 0
    const normalized = ((bass - BASS_MIN) / range) * 2 - 1
    return Math.max(-1, Math.min(1, normalized))
  }

  private normalizeTreble(treble: number): number {
    const range = TREBLE_MAX - TREBLE_MIN
    if (range === 0) return 0
    const normalized = ((treble - TREBLE_MIN) / range) * 2 - 1
    return Math.max(-1, Math.min(1, normalized))
  }

  private setupEventHandlers(): void {
    this.on("error", (error) => {
      console.debug("[AudioProcessor] Error:", error?.message ?? error)
      if (!this.isDestroyed) this.safeDestroy()
    })

    this.on("close", () => {
      console.debug("[AudioProcessor] Closed")
      this.isDestroyed = true
    })

    this.on("finish", () => {
      console.debug("[AudioProcessor] Finished")
    })
  }

  private safeDestroy(): void {
    if (this.isDestroyed) return
    this.isDestroyed = true
    try {
      this.removeAllListeners()
      if (!this.destroyed) this.destroy()
    } catch (error) {
      console.debug("[AudioProcessor] Destroy error:", (error as Error).message)
    }
  }

  override destroy(error?: Error): this {
    if (this.isDestroyed) return this
    this.isDestroyed = true
    this.removeAllListeners()
    super.destroy(error)
    return this
  }
}
