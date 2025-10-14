import type { Readable, Transform } from "stream"
import type { SimpleFFmpeg } from "../ffmpeg/SimpleFfmpegWrapper.js"
import { EventEmitter } from "eventemitter3"
import { StreamType } from "@discordjs/voice"
import { AudioProcessor } from "./AudioProcessor.js"
import { detectAudioFormat } from "../../utils/audioFormat.js"
import type { AudioProcessingOptions } from "../../types/audio.js"
import {
  DEFAULT_VOLUME,
  DEFAULT_BASS,
  DEFAULT_TREBLE,
  DEFAULT_COMPRESSOR,
  DEFAULT_NORMALIZE,
} from "../../utils/constants.js"
import { FFmpegManager } from "../ffmpeg/FfmpegManager.js"
import { safeRequestStream, safeRequestStreamWithRetry } from "../../utils/safeRequestStream.js"
import type { IncomingHttpHeaders } from "http"
import { request } from "undici"

/**
 * Configuration for HTTP requests
 */
const REQUEST_CONFIG = {
  HEADERS_TIMEOUT: 15000,
  BODY_TIMEOUT: 30000,
  STREAM_TIMEOUT: 120000,
  MAX_REDIRECTS: 5,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
} as const

/**
 * Audio service for managing audio streams with real-time effects processing.
 *
 * @example
 * \`\`\`typescript
 * const service = new AudioService({ volume: 0.5, bass: 0.2 });
 *
 * // Create processed audio stream
 * const stream = await service.createAudioStreamFromUrl('https://example.com/audio.mp3');
 *
 * // With custom headers
 * const stream = await service.createAudioStreamFromUrl(
 *   'https://example.com/audio.mp3',
 *   { 'Authorization': 'Bearer token', 'User-Agent': 'MyApp/1.0' }
 * );
 *
 * // Adjust effects in real-time
 * await service.setVolume(0.8, 2000); // Fade to 80% over 2 seconds
 * service.setBass(0.5); // Boost bass
 * \`\`\`
 */
export class AudioService extends EventEmitter {
  private processor: AudioProcessor | null = null
  private currentInputStream: Readable | null = null
  private ffmpegManager = new FFmpegManager()
  private currentFFmpegCommand: SimpleFFmpeg | null = null
  private currentOptions: AudioProcessingOptions

  constructor(options: Partial<AudioProcessingOptions> = {}) {
    super()
    this.currentOptions = {
      volume: DEFAULT_VOLUME,
      bass: DEFAULT_BASS,
      treble: DEFAULT_TREBLE,
      compressor: DEFAULT_COMPRESSOR,
      normalize: DEFAULT_NORMALIZE,
      ...options,
    }

    this.ffmpegManager.on("error", (error) => this.emit("error", error))
  }

  // ==================== Volume Control ====================

  /**
   * Set volume with smooth fade transition.
   *
   * @param volume - Volume level (0.0 to 1.0)
   * @param duration - Fade duration in milliseconds
   * @param persist - Whether to save this as the default volume
   */
  async setVolume(volume: number, duration = 2000, persist = true): Promise<void> {
    if (persist) this.currentOptions.volume = volume
    if (this.processor) {
      this.processor.startFade(volume, duration)
      this.emit("volumeChanged", volume * 100)
    }
  }

  /**
   * Set volume instantly without fade.
   *
   * @param volume - Volume level (0.0 to 1.0)
   * @param persist - Whether to save this as the default volume
   */
  setVolumeFast(volume: number, persist = false): void {
    if (persist) this.currentOptions.volume = volume
    if (this.processor) {
      this.processor.setVolume(volume)
      this.emit("volumeChanged", volume * 100)
    }
  }

  /**
   * Fade in from silence to current volume.
   */
  async fadeIn(): Promise<void> {
    if (!this.processor) return
    this.setVolumeFast(0, false)
    this.processor.startFade(this.currentOptions.volume, this.currentOptions.fade?.fadein ?? 3000)
    this.emit("volumeChanged", this.currentOptions.volume * 100)
  }

  // ==================== Equalizer Control ====================

  /**
   * Set bass level (-1.0 to 1.0).
   */
  setBass(bass: number): void {
    this.currentOptions.bass = bass
    this.updateEqualizer()
  }

  /**
   * Set treble level (-1.0 to 1.0).
   */
  setTreble(treble: number): void {
    this.currentOptions.treble = treble
    this.updateEqualizer()
  }

  /**
   * Enable or disable dynamic range compression.
   */
  setCompressor(enabled: boolean): void {
    this.currentOptions.compressor = enabled
    if (this.processor) {
      this.processor.setCompressor(enabled)
      this.emit("compressorChanged", enabled)
    }
  }

  /**
   * Set low-pass filter frequency in Hz (optional).
   */
  setLowPassFrequency(frequency?: number): void {
    this.currentOptions.lowPassFrequency = frequency
    this.emit("lowPassChanged", frequency)
  }

  private updateEqualizer(): void {
    if (this.processor) {
      this.processor.setEqualizer(this.currentOptions.bass, this.currentOptions.treble, this.currentOptions.compressor)
      this.emit("equalizerChanged", {
        bass: this.currentOptions.bass,
        treble: this.currentOptions.treble,
        compressor: this.currentOptions.compressor,
        normalize: this.currentOptions.normalize,
      })
    }
  }


  /**
   * Create a processed audio stream from URL with real-time effects.
   *
   * @param url - Audio source URL
   * @param options - Optional stream configuration
   * @returns Transform stream with processed audio
   *
   * @example
   * ```typescript
   * // Basic usage
   * const stream = await service.createAudioStreamFromUrl('https://example.com/audio.mp3');
   *
   * // With custom headers
   * const stream = await service.createAudioStreamFromUrl('https://example.com/audio.mp3', {
   *   headers: {
   *     'User-Agent': 'YandexMusicDesktopAppWindows/5.13.2',
   *     'X-Yandex-Music-Client': 'YandexMusicDesktopAppWindows/5.13.2'
   *   }
   * });
   *
   * // With custom settings
   * const stream = await service.createAudioStreamFromUrl('https://example.com/audio.mp3', {
   *   volume: 0.5,
   *   bass: 0.2,
   *   headers: { 'Authorization': 'Bearer token' }
   * });
   * ```
   */
  async createAudioStreamFromUrl(url: string, options?: any): Promise<Transform> {
    await this.destroyCurrentStreamSafe().catch(() => {})

    if (options?.volume !== undefined) this.currentOptions.volume = options.volume
    if (options?.bass !== undefined) this.currentOptions.bass = options.bass
    if (options?.treble !== undefined) this.currentOptions.treble = options.treble

    const inputFormat = await this.detectInputFormat(url, options?.headers)

    const body = await this.fetchAudioStream(url, options?.headers)

    this.currentInputStream = body
    await this.fadeIn()
    return this.createProcessedStream(body, inputFormat)
  }

  /**
   * Create audio stream optimized for Discord voice.
   * Returns raw Opus streams when possible to avoid unnecessary transcoding.
   *
   * @param url - Audio source URL
   * @param options - Optional stream configuration
   * @returns Stream and type information for Discord
   *
   * @example
   * ```typescript
   * // Basic usage
   * const { stream, type } = await service.createAudioStreamForDiscord('https://example.com/audio.mp3');
   *
   * // With Yandex Music headers
   * const { stream, type } = await service.createAudioStreamForDiscord('https://music.yandex.ru/...', {
   *   headers: {
   *     'User-Agent': 'YandexMusicDesktopAppWindows/5.13.2',
   *     'X-Yandex-Music-Client': 'YandexMusicDesktopAppWindows/5.13.2'
   *   },
   *   volume: 0.5
   * });
   * ```
   */
  async createAudioStreamForDiscord(
    url: string,
    options?: any,
  ): Promise<{ stream: Readable | Transform; type: StreamType }> {
    const inputFormat = await this.detectInputFormat(url, options?.headers)
    const requestOptions = {
      method: "GET" as const,
      headersTimeout: REQUEST_CONFIG.HEADERS_TIMEOUT,
      bodyTimeout: REQUEST_CONFIG.STREAM_TIMEOUT,
      headers: options?.headers,
    }

    try {
      // Use native Opus streams when possible (no transcoding needed)
      if (inputFormat === "opus" || inputFormat === "ogg") {
        const body = (await safeRequestStream(url, requestOptions)) as Readable
        return { stream: body, type: StreamType.OggOpus }
      }
      if (inputFormat === "webm") {
        const body = (await safeRequestStream(url, requestOptions)) as Readable
        return { stream: body, type: StreamType.WebmOpus }
      }

      // Fallback to processed stream for other formats
      const processed = await this.createAudioStreamFromUrl(url, options)
      return { stream: processed, type: StreamType.Raw }
    } catch (err) {
      this.handleStreamError(err as Error, url)
      throw err
    }
  }

  // ==================== Utilities ====================

  /**
   * Detect audio format from URL headers.
   *
   * @param url - Audio source URL
   * @param headers - Optional HTTP headers for the request
   */
  private async detectInputFormat(url: string, headers?: Record<string, string>): Promise<string | undefined> {
    if (url.includes("music.yandex") && !headers) {
      this.emit("debug", "Yandex Music requires User-Agent and X-Yandex-Music-Client headers")
    }

    try {
      const responseHeaders = await this.fetchHeadersWithRedirects(url, REQUEST_CONFIG.MAX_REDIRECTS, headers)
      const mimeType = this.extractMimeType(responseHeaders)

      const format = detectAudioFormat(mimeType, url)

      return format
    } catch (error) {
      this.emit("debug", `Failed to detect format: ${(error as Error).message}`)
      return undefined
    }
  }

  /**
   * Fetch audio stream with retry logic and timeout handling.
   *
   * @param url - Audio source URL
   * @param headers - Optional HTTP headers for the request
   */
  private async fetchAudioStream(url: string, headers?: Record<string, string>): Promise<Readable> {
    try {
      const stream = (await safeRequestStreamWithRetry(
        url,
        {
          method: "GET",
          headersTimeout: REQUEST_CONFIG.HEADERS_TIMEOUT,
          bodyTimeout: REQUEST_CONFIG.STREAM_TIMEOUT,
          headers,
        },
        REQUEST_CONFIG.MAX_RETRIES,
        REQUEST_CONFIG.RETRY_DELAY,
      )) as Readable

      return stream
    } catch (err) {
      this.handleStreamError(err as Error, url)
      throw err
    }
  }

  /**
   * Follow redirects and fetch final headers.
   *
   * @param url - Audio source URL
   * @param maxRedirects - Maximum number of redirects to follow
   * @param headers - Optional HTTP headers for the request
   */
  private async fetchHeadersWithRedirects(
    url: string,
    maxRedirects = REQUEST_CONFIG.MAX_REDIRECTS,
    headers?: Record<string, string>,
  ): Promise<IncomingHttpHeaders> {
    let current = url

    for (let i = 0; i < maxRedirects; i++) {
      const res = await request(current, {
        method: "HEAD",
        headersTimeout: REQUEST_CONFIG.HEADERS_TIMEOUT,
        bodyTimeout: REQUEST_CONFIG.BODY_TIMEOUT,
        headers,
      })

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const location = Array.isArray(res.headers.location) ? res.headers.location[0] : res.headers.location

        if (!location) break

        current = location.startsWith("http") ? location : new URL(location, current).toString()
        continue
      }

      return res.headers
    }

    throw new Error(`Too many redirects for ${url}`)
  }

  /**
   * Extract MIME type from headers.
   */
  private extractMimeType(headers: IncomingHttpHeaders): string | undefined {
    const contentType = headers["content-type"]
    if (typeof contentType === "string") return contentType
    if (Array.isArray(contentType)) return contentType[0]
    return undefined
  }

  /**
   * Build FFmpeg audio filter chain.
   */
  private buildAudioFilters(): string[] {
    const filters: string[] = []

    // Initial volume (fine-tuned by AudioProcessor)
    filters.push(`volume=${this.currentOptions.volume}`)

    // Low-pass filter (if specified)
    if (this.currentOptions.lowPassFrequency) {
      filters.push(`lowpass=f=${this.currentOptions.lowPassFrequency}`)
    }

    return filters
  }

  /**
   * Setup error handlers for all streams in the pipeline.
   */
  private setupStreamErrorHandlers(inputStream: Readable, outputStream: any, done: Promise<void>): void {
    let streamEnded = false
    let cleanupCalled = false

    const cleanup = async () => {
      if (cleanupCalled) return
      cleanupCalled = true
      streamEnded = true

      // Safely destroy all streams
      try {
        inputStream.destroy()
        outputStream.destroy()
        if (this.processor && !this.processor.destroyed) {
          this.processor.destroy()
        }
      } catch (err) {
        this.emit("debug", `Cleanup error: ${(err as Error).message}`)
      }
    }

    const handleError = (source: string, error: Error) => {
      if (streamEnded || this.isIgnorableError(error.message)) {
        this.emit("debug", `[${source}] Ignored: ${error.message}`)
        return
      }
      this.emit("error", new Error(`${source}: ${error.message}`))
      cleanup()
    }

    inputStream.on("error", (err) => handleError("Input", err))
    inputStream.on("close", () => {
      if (!streamEnded) {
        this.emit("debug", "Input stream closed prematurely")
        cleanup()
      }
    })

    outputStream.on("error", (err: Error) => handleError("FFmpeg", err))
    outputStream.on("close", () => {
      if (!streamEnded) {
        this.emit("debug", "FFmpeg output closed prematurely")
        cleanup()
      }
    })

    done
      .catch((err) => {
        if (!this.isIgnorableError(err.message)) {
          handleError("FFmpeg Process", err)
        } else {
          this.emit("debug", `FFmpeg process ended: ${err.message}`)
        }
      })
      .then(() => {
        streamEnded = true
        this.emit("debug", "FFmpeg finished processing")
      })
      .catch(() => {
        // Catch any errors from the then block to prevent unhandled rejections
      })

    if (this.processor) {
      this.processor.on("end", () => {
        streamEnded = true
      })
      this.processor.on("error", (err) => handleError("Processor", err))
      this.processor.on("close", () => {
        if (!streamEnded) {
          this.emit("debug", "Processor closed prematurely")
          cleanup()
        }
      })
    }
  }

  /**
   * Check if error can be safely ignored.
   */
  private isIgnorableError(message: string): boolean {
    const ignorable = [
      "premature close",
      "err_stream_premature_close",
      "write after end",
      "epipe",
      "other side closed",
      "econnreset",
      "socket hang up",
      "aborted",
      "connection reset",
      "exited with code 152",
      "exited with code 183", // Added exit code 183
      "exited with code 255",
      "exit code 152",
      "exit code 183", // Added exit code 183
      "exit code 255",
    ]
    return ignorable.some((pattern) => message.toLowerCase().includes(pattern))
  }

  // ==================== Utilities ====================

  /**
   * Handle stream errors with proper logging and event emission.
   *
   * @param error - The error that occurred
   * @param url - The URL that caused the error
   */
  private handleStreamError(error: Error, url: string): void {
    const errorMessage = `Stream error for ${url}: ${error.message}`
    this.emit("error", new Error(errorMessage))
    this.emit("debug", errorMessage)
  }

  // ==================== Cleanup ====================

  /**
   * Safely destroy current stream and cleanup resources.
   */
  async destroyCurrentStreamSafe(): Promise<void> {
    if (this.currentFFmpegCommand) {
      await this.ffmpegManager.terminateProcess(this.currentFFmpegCommand).catch(() => {})
      this.currentFFmpegCommand = null
    }

    if (this.currentInputStream) {
      this.currentInputStream.removeAllListeners()
      this.currentInputStream.destroy()
      this.currentInputStream = null
    }

    if (this.processor) {
      this.processor.removeAllListeners()
      this.processor.end()
      this.processor = null
    }
  }

  /**
   * Destroy service and cleanup all resources.
   */
  async destroy(): Promise<void> {
    await this.ffmpegManager.terminateAll()
    this.processor = null
    this.removeAllListeners()
  }

  // ==================== Stream Processing ====================

  /**
   * Create processed audio stream with FFmpeg pipeline.
   */
  private async createProcessedStream(inputStream: Readable, inputFormat?: string): Promise<Transform> {
    const filters = this.buildAudioFilters()

    const ffmpegCommand = await this.ffmpegManager.createCommand()

    ffmpegCommand
      .inputs(inputStream as any)
      .options("-fflags", "nobuffer")
      .options("-flags", "low_delay")
      .options("-probesize", "32")
      .options("-analyzeduration", "0")

    if (inputFormat) {
      ffmpegCommand.options("-f", inputFormat ?? "mp3")
    } else {
      ffmpegCommand.options("-f", "mp3")
    }

    ffmpegCommand
      .options("-acodec", "pcm_s16le")
      .options("-f", "s16le")
      .options("-ar", "48000")
      .options("-ac", "2")
      .options("-af", filters.join(","))
      .output("pipe:1")

    this.currentFFmpegCommand = ffmpegCommand
    this.processor = new AudioProcessor(this.currentOptions)

    const { output, done } = ffmpegCommand.run()

    this.setupStreamErrorHandlers(inputStream, output, done)
    ;(output as Readable).pipe(this.processor as Transform, { end: true })
    ;(output as Readable).on("error", (err) => {
      if (!this.isIgnorableError(err.message)) {
        this.emit("debug", `Output stream error during pipe: ${err.message}`)
      }
    })

    this.emit("streamCreated", this.processor)
    return this.processor as Transform
  }
}
