import { EventEmitter } from "eventemitter3"
import { type Readable, PassThrough, pipeline } from "stream"
import { execa, type Subprocess } from "execa"
import { bot } from './../../bot.js';

/**
 * Configuration options for SimpleFFmpeg instance
 */
export interface SimpleFFmpegOptions {
  /** Path to FFmpeg binary (default: "ffmpeg") */
  ffmpegPath?: string
  /** Enable fail-fast mode with -xerror flag */
  failFast?: boolean
  /** Additional global arguments to prepend */
  extraGlobalArgs?: string[]
  /** AbortSignal for cancellation support */
  abortSignal?: AbortSignal
  /** Tag for logging identification */
  loggerTag?: string
  /** Process timeout in milliseconds (0 = no timeout) */
  timeout?: number
  /** Maximum stderr buffer size in bytes */
  maxStderrBuffer?: number
  /** Enable progress event emission */
  enableProgressTracking?: boolean
  /** Custom logger implementation */
  logger?: Logger
}

/**
 * Logger interface for custom logging implementations
 */
export interface Logger {
  debug: (message: string, meta?: any) => void
  warn: (message: string, meta?: any) => void
  error: (message: string, meta?: any) => void
}

/**
 * FFmpeg progress information emitted during processing
 */
export interface FFmpegProgress {
  frame: number
  fps: number
  bitrate: string
  totalSize: number
  outTimeUs: number
  outTime: string
  dupFrames: number
  dropFrames: number
  speed: number
  progress: string
}

/**
 * Statistics collected during FFmpeg process execution
 */
export interface FFmpegStats {
  startTime: Date
  endTime?: Date
  duration?: number
  exitCode?: number
  signal?: string
  stderrLines: number
  bytesProcessed: number
}

/**
 * Result of running an FFmpeg command
 */
export interface FFmpegRunResult {
  /** Output stream for reading processed data */
  output: PassThrough
  /** Promise that resolves when processing completes */
  done: Promise<void>
}

/**
 * Error patterns that indicate process termination (not failures)
 */
const TERMINATION_ERROR_PATTERNS = [
  "sigkill",
  "sigterm",
  "was killed",
  "premature close",
  "err_stream_premature_close",
  "other side closed",
  "econnreset",
  "socketerror",
  "timeout",
  "request aborted",
  "aborted",
  "write after end",
  "epipe",
] as const

/**
 * Fluent wrapper for FFmpeg with stream support and progress tracking
 *
 * @example
 * \`\`\`typescript
 * const ffmpeg = new SimpleFFmpeg({ enableProgressTracking: true });
 *
 * const { output, done } = ffmpeg
 *   .input('input.mp4')
 *   .videoCodec('libx264')
 *   .audioBitrate('128k')
 *   .output('output.mp4')
 *   .overwrite()
 *   .run();
 *
 * output.pipe(fs.createWriteStream('output.mp4'));
 * await done;
 * \`\`\`
 */
export class SimpleFFmpeg extends EventEmitter {
  private process: Subprocess | null = null
  private args: string[] = []
  private inputStreams: Array<{ stream: Readable; index: number }> = []
  private outputStream: PassThrough | null = null
  private stderrBuffer = ""
  private isTerminating = false
  private finished = false
  private stats: FFmpegStats
  private timeoutHandle?: NodeJS.Timeout

  private doneResolve!: () => void
  private doneReject!: (err: Error) => void
  private readonly donePromise: Promise<void>

  private readonly config: Required<Omit<SimpleFFmpegOptions, "abortSignal">> & {
    abortSignal?: AbortSignal
  }

  /** Process ID of the running FFmpeg process (null if not started) */
  public readonly pid: number | null = null

  constructor(options: SimpleFFmpegOptions = {}) {
    super()

    this.config = {
      ffmpegPath: options.ffmpegPath ?? "ffmpeg",
      failFast: options.failFast ?? false,
      extraGlobalArgs: options.extraGlobalArgs ?? [],
      loggerTag: options.loggerTag ?? `ffmpeg_${Date.now()}`,
      timeout: options.timeout ?? 0,
      maxStderrBuffer: options.maxStderrBuffer ?? 1024 * 1024,
      enableProgressTracking: options.enableProgressTracking ?? false,
      logger: options.logger ?? console,
      abortSignal: options.abortSignal,
    }

    this.stats = {
      startTime: new Date(),
      stderrLines: 0,
      bytesProcessed: 0,
    }

    this.donePromise = new Promise<void>((resolve, reject) => {
      this.doneResolve = resolve
      this.doneReject = reject
    })

    this.setupAbortSignal()
    this.setupInitialArgs()
  }

  // ============================================================================
  // Fluent API - Input Configuration
  // ============================================================================

  /**
   * Add an input source (file path or stream)
   * @param input - File path or readable stream
   */
  input(input: string | Readable): this {
    if (typeof input === "string") {
      this.args.push("-i", input)
    } else {
      const index = this.inputStreams.length
      this.inputStreams.push({ stream: input, index })
      this.args.push("-i", "pipe:0")
    }
    return this
  }

  /** Alias for input() for backward compatibility */
  inputs(input: string | Readable): this {
    return this.input(input)
  }

  /**
   * Add options before the last input
   * @param opts - FFmpeg options to add
   */
  inputOptions(...opts: string[]): this {
    const lastInputIndex = this.args.lastIndexOf("-i")
    if (lastInputIndex !== -1) {
      this.args.splice(lastInputIndex, 0, ...opts)
    } else {
      this.args.unshift(...opts)
    }
    return this
  }

  // ============================================================================
  // Fluent API - Output Configuration
  // ============================================================================

  /**
   * Set output destination
   * @param output - Output file path or "pipe:1" for stdout
   */
  output(output: string): this {
    this.args.push(output)
    return this
  }

  /**
   * Add output options
   * @param opts - FFmpeg options to add
   */
  outputOptions(...opts: string[]): this {
    this.args.push(...opts)
    return this
  }

  /** Alias for outputOptions() for backward compatibility */
  options(...opts: string[]): this {
    return this.outputOptions(...opts)
  }

  // ============================================================================
  // Fluent API - Convenience Methods
  // ============================================================================

  /** Set video codec (e.g., "libx264", "copy") */
  videoCodec(codec: string): this {
    return this.outputOptions("-c:v", codec)
  }

  /** Set audio codec (e.g., "aac", "copy") */
  audioCodec(codec: string): this {
    return this.outputOptions("-c:a", codec)
  }

  /** Set video bitrate (e.g., "1000k", "2M") */
  videoBitrate(bitrate: string): this {
    return this.outputOptions("-b:v", bitrate)
  }

  /** Set audio bitrate (e.g., "128k", "192k") */
  audioBitrate(bitrate: string): this {
    return this.outputOptions("-b:a", bitrate)
  }

  /** Set output video size (e.g., "1920x1080", "hd720") */
  size(size: string): this {
    return this.outputOptions("-s", size)
  }

  /** Set output framerate */
  fps(fps: number): this {
    return this.outputOptions("-r", fps.toString())
  }

  /** Set output duration (in seconds or "HH:MM:SS" format) */
  duration(duration: string | number): this {
    const durationStr = typeof duration === "number" ? duration.toString() : duration
    return this.outputOptions("-t", durationStr)
  }

  /** Seek to position before processing (in seconds or "HH:MM:SS" format) */
  seek(time: string | number): this {
    const timeStr = typeof time === "number" ? time.toString() : time
    return this.outputOptions("-ss", timeStr)
  }

  /** Set output format (e.g., "mp4", "webm", "mp3") */
  format(format: string): this {
    return this.outputOptions("-f", format)
  }

  /** Overwrite output file if it exists */
  overwrite(): this {
    return this.outputOptions("-y")
  }

  /** Do not overwrite output file if it exists */
  noOverwrite(): this {
    return this.outputOptions("-n")
  }

  // ============================================================================
  // Process Execution
  // ============================================================================

  /**
   * Start the FFmpeg process
   * @returns Object with output stream and completion promise
   * @throws Error if process is already running
   */
  run(): FFmpegRunResult {
    if (this.process) {
      throw new Error("FFmpeg process is already running")
    }

    this.outputStream = new PassThrough()
    const fullCmd = `${this.config.ffmpegPath} ${this.args.join(" ")}`

    this.emit("start", fullCmd)
    bot.logger.debug("debug", `Starting: ${fullCmd}`)

    this.process = execa(this.config.ffmpegPath, this.args, {
      reject: false,
      all: false,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    ;(this as any).pid = this.process.pid ?? null
    bot.logger.debug("debug", `PID: ${this.pid}`)

    this.setupTimeout()
    this.setupInputStreams()
    this.setupOutputStreams()
    this.setupProcessEvents()

    return { output: this.outputStream, done: this.donePromise }
  }

  /**
   * Terminate the FFmpeg process
   * @param signal - Signal to send (default: SIGTERM)
   */
  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    if (this.process && !this.isTerminating) {
      this.isTerminating = true
      try {
        this.cleanup()
        this.process.kill(signal)
      } catch (error) {
        bot.logger.debug("debug", `Kill error (ignored): ${error}`)
      }
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /** Get the full FFmpeg command as a string */
  toString(): string {
    return `${this.config.ffmpegPath} ${this.args.join(" ")}`
  }

  /** Get a copy of the command arguments */
  getArgs(): string[] {
    return [...this.args]
  }

  /** Get current execution statistics */
  getStats(): FFmpegStats {
    return { ...this.stats }
  }

  /** Check if the process is currently running */
  isRunning(): boolean {
    return this.process !== null && !this.finished
  }

  /** Promise that resolves when the process completes */
  get done(): Promise<void> {
    return this.donePromise
  }

  /** Access to stdout stream (only available after run()) */
  get stdout(): Readable {
    if (!this.process?.stdout) {
      throw new Error("FFmpeg process not started or stdout unavailable")
    }
    return this.process.stdout
  }

  // ============================================================================
  // Private Methods - Setup
  // ============================================================================

  private setupAbortSignal(): void {
    if (!this.config.abortSignal) return

    if (this.config.abortSignal.aborted) {
      this.kill("SIGTERM")
    } else {
      this.config.abortSignal.addEventListener("abort", () => this.kill("SIGTERM"), {
        once: true,
      })
    }
  }

  private setupInitialArgs(): void {
    if (this.config.extraGlobalArgs.length > 0) {
      this.args.push(...this.config.extraGlobalArgs)
    }
    if (this.config.failFast) {
      this.args.push("-xerror")
    }
    if (this.config.enableProgressTracking) {
      this.args.push("-progress", "pipe:2")
    }
  }

  private setupTimeout(): void {
    if (this.config.timeout > 0) {
      this.timeoutHandle = setTimeout(() => {
        bot.logger.error("warn", `Process timeout after ${this.config.timeout}ms`)
        this.kill("SIGTERM")
      }, this.config.timeout)
    }
  }

  private setupInputStreams(): void {
    if (this.inputStreams.length === 0 || !this.process?.stdin) return

    // Handle first input stream (TODO: Support multiple input streams)
    const firstInput = this.inputStreams[0]

    const endStdin = () => {
      if (this.process?.stdin && !this.process.stdin.destroyed) {
        this.process.stdin.end()
      }
    }

    firstInput.stream.once("end", endStdin).once("close", endStdin)

    firstInput.stream.on("error", (err) => {
      if (!this.isIgnorableError(err)) {
        bot.logger.error("error", `Input stream error: ${err.message}`)
        this.emit("error", err)
      }
    })

    this.process.stdin.on("error", (err) => {
      if (!this.isIgnorableError(err)) {
        bot.logger.error("error", `Stdin error: ${err.message}`)
        this.emit("error", err)
      }
    })

    pipeline(firstInput.stream, this.process.stdin, (err) => {
      if (err && !this.isIgnorableError(err)) {
        bot.logger.error("error", `Pipeline failed: ${err.message}`)
        this.emit("error", err)
      }
    })
  }

  private setupOutputStreams(): void {
    if (!this.process || !this.outputStream) return

    // Setup stdout
    this.process.stdout?.on("error", (e) => bot.logger.debug("debug", `stdout error: ${e}`))

    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.stats.bytesProcessed += chunk.length
      this.emit("data", chunk)
    })

    if (this.process.stdout) {
      pipeline(this.process.stdout, this.outputStream, (err) => {
        if (err && !this.isIgnorableError(err)) {
          bot.logger.error("error", `Output pipeline failed: ${err.message}`)
          this.emit("error", err)
        }
      })
    }

    // Setup stderr
    this.process.stderr?.on("data", (chunk: Buffer) => {
      this.handleStderrData(chunk)
    })

    this.process.stderr?.on("error", (e) => bot.logger.debug("debug", `stderr error: ${e}`))
  }

  private handleStderrData(chunk: Buffer): void {
    const text = chunk.toString("utf-8")
    this.stats.stderrLines++

    // Prevent memory issues with large stderr buffers
    if (this.stderrBuffer.length + text.length > this.config.maxStderrBuffer) {
      this.stderrBuffer = this.stderrBuffer.slice(text.length)
    }
    this.stderrBuffer += text

    // Parse progress if enabled
    if (this.config.enableProgressTracking) {
      const lines = text.split("\n")
      for (const line of lines) {
        if (line.includes("=")) {
          const progress = this.parseProgress(line)
          if (progress) {
            this.emit("progress", progress)
          }
        }
      }
    }

    if (process.env.STDERR_LOG) {
      bot.logger.debug("debug", `stderr: ${text.trim()}`)
    }
  }

  private setupProcessEvents(): void {
    if (!this.process) return

    this.process.once("exit", (code, signal) => {
      this.handleProcessExit(code, signal)
    })

    this.process.once("error", (err: Error) => {
      if (!this.isTerminating || !this.isIgnorableError(err)) {
        bot.logger.error("error", `Process error: ${err.message}`)
        this.emit("error", err)
        this.finish(err)
      }
    })

    this.process.on("cancel", () => this.kill("SIGTERM"))
  }

  // ============================================================================
  // Private Methods - Event Handling
  // ============================================================================

  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.stats.exitCode = code ?? undefined
    this.stats.signal = signal ?? undefined

    bot.logger.debug("debug", `Exit code ${code}, signal ${signal}`)
    this.cleanup()

    const isRecoverableExit = code === 152 || code === 183 || code === 255
    const isSuccess = (code === 0 && !this.isTerminating) || this.isTerminating || isRecoverableExit

    if (isSuccess) {
      if (this.isTerminating || isRecoverableExit) {
        this.emit("terminated", signal ?? "SIGTERM")
      }
      this.emit("end")
      this.finish()
    } else {
      const error = this.createExitError(code, signal)
      this.emit("error", error)
      this.finish(error)
    }
  }

  private createExitError(code: number | null, signal: NodeJS.Signals | null): Error {
    const stderrSnippet = this.stderrBuffer.trim().slice(0, 2000)
    let message = `FFmpeg exited with code ${code}`

    if (signal) {
      message += `, signal ${signal}`
    }
    if (stderrSnippet) {
      message += `, stderr: ${stderrSnippet.replace(/\n/g, " ")}`
    }

    return new Error(message)
  }

  private finish(error?: Error): void {
    if (this.finished) return
    this.finished = true

    this.stats.endTime = new Date()
    this.stats.duration = this.stats.endTime.getTime() - this.stats.startTime.getTime()

    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
    }

    if (error) {
      this.doneReject(error)
    } else {
      this.doneResolve()
    }
  }

  private cleanup(): void {
    try {
      this.outputStream?.destroy()
      this.process?.stdin?.end()
      this.process?.stdout?.destroy()
      this.process?.stderr?.destroy()
    } catch (error) {
      bot.logger.error("debug", `Cleanup error (ignored): ${error}`)
    }
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private parseProgress(line: string): Partial<FFmpegProgress> | null {
    const progress: Partial<FFmpegProgress> = {}
    const pairs = line.split("=")

    for (let i = 0; i < pairs.length - 1; i += 2) {
      const key = pairs[i].trim()
      const value = pairs[i + 1].trim()

      switch (key) {
        case "frame":
          progress.frame = Number.parseInt(value, 10)
          break
        case "fps":
          progress.fps = Number.parseFloat(value)
          break
        case "bitrate":
          progress.bitrate = value
          break
        case "total_size":
          progress.totalSize = Number.parseInt(value, 10)
          break
        case "out_time_us":
          progress.outTimeUs = Number.parseInt(value, 10)
          break
        case "out_time":
          progress.outTime = value
          break
        case "dup_frames":
          progress.dupFrames = Number.parseInt(value, 10)
          break
        case "drop_frames":
          progress.dropFrames = Number.parseInt(value, 10)
          break
        case "speed":
          progress.speed = Number.parseFloat(value.replace("x", ""))
          break
        case "progress":
          progress.progress = value
          break
      }
    }

    return Object.keys(progress).length > 0 ? progress : null
  }

  private isIgnorableError(error: any): boolean {
    const message = (error?.message || "").toLowerCase()
    return error?.code === "EPIPE" || TERMINATION_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
  }

  // ============================================================================
  // Event Type Definitions
  // ============================================================================

  override on(event: "start", listener: (cmd: string) => void): this
  override on(event: "end", listener: () => void): this
  override on(event: "terminated", listener: (signal: NodeJS.Signals | string) => void): this
  override on(event: "error", listener: (error: Error) => void): this
  override on(event: "data", listener: (chunk: Buffer) => void): this
  override on(event: "progress", listener: (progress: Partial<FFmpegProgress>) => void): this
  override on(event: "close", listener: () => void): this
  override on(event: "exit", listener: () => void): this
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }
}
