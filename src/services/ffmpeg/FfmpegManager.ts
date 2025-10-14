import { EventEmitter } from "eventemitter3"
import { SimpleFFmpeg, type SimpleFFmpegOptions, type Logger } from "./SimpleFfmpegWrapper.js"
import { bot } from '../../bot.js'

export interface FFmpegManagerOptions {
  maxConcurrentProcesses?: number
  defaultTimeout?: number
  enableMetrics?: boolean
  timeoutRetries?: number
  timeoutGracePeriod?: number
  logger?: Logger
}

export interface ProcessMetrics {
  totalCreated: number
  totalCompleted: number
  totalFailed: number
  totalTerminated: number
  averageExecutionTime: number
  peakConcurrency: number
}

export interface ProcessInfo {
  id: string
  pid: number | null
  startTime: Date
  command: string
  status: "running" | "completed" | "failed" | "terminated"
}

export interface ProcessEndedEvent {
  id: string
  reason: string
  status: ProcessStatus
  executionTime: number
}

export interface ProcessErrorEvent {
  processId: string
  error: Error
  status: ProcessStatus
  isTimeout: boolean
  isTermination: boolean
}

type ProcessStatus = "totalCompleted" | "totalFailed" | "totalTerminated"

interface ActiveProcess {
  command: SimpleFFmpeg
  startTime: Date
  timeout?: NodeJS.Timeout
}

interface QueuedProcess {
  id: string
  factory: () => SimpleFFmpeg
  resolve: (command: SimpleFFmpeg) => void
  reject: (error: Error) => void
}

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
  "operation timed out",
  "connection timeout",
  "exit 152",
  "exit 183", // Added exit code 183 as recoverable termination
  "exit 255",
] as const

const TIMEOUT_ERROR_PATTERNS = ["timeout", "operation timed out", "connection timeout", "request timeout"] as const

/**
 * Manager for handling multiple FFmpeg processes with concurrency control,
 * timeout handling, and metrics collection.
 *
 * @example
 * \`\`\`typescript
 * const manager = new FFmpegManager({
 *   maxConcurrentProcesses: 3,
 *   defaultTimeout: 60000, // 1 minute
 *   enableMetrics: true
 * });
 *
 * manager.on('processStarted', ({ processId, pid }) => {
 *   console.log(`Process ${processId} started with PID ${pid}`);
 * });
 *
 * const command = await manager.createCommand();
 * const { output, done } = command
 *   .input('input.mp4')
 *   .videoCodec('libx264')
 *   .output('output.mp4')
 *   .run();
 *
 * await done;
 * console.log('Metrics:', manager.getMetrics());
 * \`\`\`
 */
export class FFmpegManager extends EventEmitter {
  private activeProcesses = new Map<string, ActiveProcess>()
  private processQueue: QueuedProcess[] = []
  private metrics: ProcessMetrics = {
    totalCreated: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalTerminated: 0,
    averageExecutionTime: 0,
    peakConcurrency: 0,
  }
  private executionTimes: number[] = []
  private readonly options: Required<FFmpegManagerOptions>

  constructor(options: FFmpegManagerOptions = {}) {
    super()
    this.options = {
      maxConcurrentProcesses: options.maxConcurrentProcesses ?? 5,
      defaultTimeout: options.defaultTimeout ?? 300_000,
      enableMetrics: options.enableMetrics ?? true,
      timeoutRetries: options.timeoutRetries ?? 1,
      timeoutGracePeriod: options.timeoutGracePeriod ?? 5_000,
      logger: options.logger ?? console,
    }
  }

  // ============================================================================
  // Public API - Process Management
  // ============================================================================

  /**
   * Create a new FFmpeg command instance
   * @param commandOptions - Options for the FFmpeg command
   * @returns Promise that resolves to a SimpleFFmpeg instance
   */
  async createCommand(commandOptions: SimpleFFmpegOptions = {}): Promise<SimpleFFmpeg> {
    const processId = this.generateProcessId()

    if (this.activeProcesses.size >= this.options.maxConcurrentProcesses) {
      return this.queueProcess(processId, commandOptions)
    }

    return this.createCommandInternal(processId, commandOptions)
  }

  /**
   * Terminate a specific process
   * @param command - The FFmpeg command to terminate
   * @param signal - Signal to send (default: SIGTERM)
   */
  async terminateProcess(command: SimpleFFmpeg, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
    const processId = this.findProcessId(command)
    if (!processId) return

    bot.logger.log("debug", `Terminating process ${processId} with ${signal}`)

    return new Promise<void>((resolve) => {
      let resolved = false
      const finish = (_event: string) => {
        if (resolved) return
        resolved = true
        this.cleanupTermination(processId)
        resolve()
      }

      const events = ["error", "end", "close", "exit"] as const
      events.forEach((event) => command.once(event as any, () => finish(event)))

      this.sendTerminationSignal(command, processId, signal, finish)
    })
  }

  /**
   * Terminate all active processes
   * @param signal - Signal to send (default: SIGTERM)
   */
  async terminateAll(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
    const processes = Array.from(this.activeProcesses.values()).map((info) => info.command)
    bot.logger.debug("debug", `Terminating all ${processes.length} processes`)

    // Reject all queued processes
    this.processQueue.forEach((item) => item.reject(new Error("Manager terminating all processes")))
    this.processQueue.length = 0

    // Terminate all active processes
    const results = await Promise.allSettled(processes.map((p) => this.terminateProcess(p, signal)))

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        bot.logger.warn("warn", `Failed to terminate process #${index}: ${result.reason}`)
      }
    })
  }

  /**
   * Wait for all active processes to complete
   */
  async waitForAll(): Promise<void> {
    const promises = Array.from(this.activeProcesses.values()).map((info) => info.command.done)
    await Promise.allSettled(promises)
  }

  // ============================================================================
  // Public API - Status & Metrics
  // ============================================================================

  /**
   * Get the number of currently active processes
   */
  getActiveProcessCount(): number {
    return this.activeProcesses.size
  }

  /**
   * Get the number of queued processes waiting to start
   */
  getQueuedProcessCount(): number {
    return this.processQueue.length
  }

  /**
   * Get collected metrics
   */
  getMetrics(): ProcessMetrics {
    return { ...this.metrics }
  }

  /**
   * Get information about all active processes
   */
  getActiveProcesses(): ProcessInfo[] {
    return Array.from(this.activeProcesses.entries()).map(([id, info]) => ({
      id,
      pid: info.command.pid,
      startTime: info.startTime,
      command: info.command.toString?.() ?? "unknown",
      status: "running",
    }))
  }

  /**
   * Check if the manager is in a healthy state
   * @returns true if failure and termination rates are within acceptable limits
   */
  isHealthy(): boolean {
    const { totalCreated, totalFailed, totalTerminated } = this.metrics
    const failureRate = totalCreated > 0 ? totalFailed / totalCreated : 0
    const terminationRate = totalCreated > 0 ? totalTerminated / totalCreated : 0

    return (
      failureRate < 0.1 && terminationRate < 0.2 && this.activeProcesses.size <= this.options.maxConcurrentProcesses
    )
  }

  // ============================================================================
  // Private Methods - Process Creation
  // ============================================================================

  private queueProcess(processId: string, commandOptions: SimpleFFmpegOptions): Promise<SimpleFFmpeg> {
    return new Promise((resolve, reject) => {
      const item: QueuedProcess = {
        id: processId,
        factory: () => this.createCommandInternal(processId, commandOptions),
        resolve,
        reject,
      }
      this.processQueue.push(item)
      bot.logger.debug("debug", `Process queued: ${processId}`)
    })
  }

  private createCommandInternal(processId: string, commandOptions: SimpleFFmpegOptions): SimpleFFmpeg {
    const command = new SimpleFFmpeg({
      ...commandOptions,
      loggerTag: commandOptions.loggerTag ?? processId,
      logger: commandOptions.logger ?? this.options.logger,
    })

    this.setupProcess(processId, command)
    this.updateConcurrencyMetrics()

    // Отправляем событие после spawn, чтобы PID был известен
    command.once("spawn", () => {
      this.emitProcessStarted(processId, command)
    })

    return command
  }

  private setupProcess(processId: string, command: SimpleFFmpeg): void {
    const startTime = new Date()
    const processInfo: ActiveProcess = {
      command,
      startTime,
      timeout: this.createTimeout(processId),
    }
    this.activeProcesses.set(processId, processInfo)
    this.metrics.totalCreated++
    this.setupEventHandlers(processId, command)
  }

  private createTimeout(processId: string): NodeJS.Timeout | undefined {
    return this.options.defaultTimeout > 0
      ? setTimeout(() => this.handleTimeout(processId), this.options.defaultTimeout)
      : undefined
  }

  private setupEventHandlers(processId: string, command: SimpleFFmpeg): void {
    const cleanup = (reason: string, status: ProcessStatus) => this.cleanupProcess(processId, reason, status)
    const onComplete = () => cleanup("end", "totalCompleted")

    command.once("end", onComplete)
    command.once("close", onComplete)
    command.once("exit", onComplete)

    command.on("error", (error: Error) => {
      const status = this.categorizeError(error)
      cleanup("error", status)

      this.emit("error", {
        processId,
        error,
        status,
        isTimeout: this.isTimeoutError(error),
        isTermination: this.isTerminationError(error),
      } as ProcessErrorEvent)
    })
  }

  // ============================================================================
  // Private Methods - Process Cleanup
  // ============================================================================

  private cleanupProcess(processId: string, reason: string, status: ProcessStatus): void {
    const info = this.activeProcesses.get(processId)
    if (!info) return

    try {
      if (info.timeout) clearTimeout(info.timeout)

      const executionTime = Date.now() - info.startTime.getTime()
      this.updateExecutionMetrics(executionTime)

      this.activeProcesses.delete(processId)

      if (this.options.enableMetrics) {
        this.metrics[status]++
      }

      bot.logger.debug("debug", `Process ${processId} ${status}: ${reason}`)

      this.emit("processEnded", {
        id: processId,
        reason,
        status,
        executionTime,
      } as ProcessEndedEvent)

      this.processNextInQueue()
    } catch (error) {
      this.handleError(processId, error as Error, "cleanup")
    }
  }

  private cleanupTermination(processId: string): void {
    const info = this.activeProcesses.get(processId)
    if (info?.timeout) clearTimeout(info.timeout)
    this.activeProcesses.delete(processId)
  }

  // ============================================================================
  // Private Methods - Timeout Handling
  // ============================================================================

  private handleTimeout(processId: string): void {
    const info = this.activeProcesses.get(processId)
    if (!info) return

    const executionTime = Date.now() - info.startTime.getTime()

    bot.logger.warn("warn", `Process ${processId} timed out`, {
      processId,
      executionTime: `${Math.round(executionTime / 1000)}s`,
      timeout: `${this.options.defaultTimeout / 1000}s`,
      command: info.command.toString?.() ?? "unknown",
    })

    this.terminateProcessGracefully(processId, info.command).catch((err) =>
      this.handleError(processId, err, "timeout termination"),
    )
  }

  private async terminateProcessGracefully(processId: string, command: SimpleFFmpeg): Promise<void> {
    try {
      await Promise.race([
        this.terminateProcess(command, "SIGTERM"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Graceful termination timeout")), this.options.timeoutGracePeriod),
        ),
      ])
    } catch {
      bot.logger.warn("warn", `Force killing process ${processId}`)
      await this.terminateProcess(command, "SIGKILL")
    }
  }

  private sendTerminationSignal(
    command: SimpleFFmpeg,
    processId: string,
    signal: NodeJS.Signals,
    finish: (reason: string) => void,
  ): void {
    try {
      command.kill(signal)

      // Escalate to SIGKILL if SIGTERM doesn't work
      if (signal !== "SIGKILL") {
        setTimeout(() => {
          try {
            command.kill("SIGKILL")
          } catch (err) {
            bot.logger.warn("warn", `Failed to send SIGKILL to ${processId}: ${err}`)
          }
        }, 2000)
      }

      // Force finish after timeout
      setTimeout(() => finish("force_timeout"), 5000)
    } catch (err) {
      this.handleError(processId, err as Error, "signal_sending")
      finish("signal_error")
    }
  }

  // ============================================================================
  // Private Methods - Queue Management
  // ============================================================================

  private processNextInQueue(): void {
    if (this.processQueue.length === 0 || this.activeProcesses.size >= this.options.maxConcurrentProcesses) {
      return
    }

    const next = this.processQueue.shift()!
    try {
      const command = next.factory()
      next.resolve(command)
    } catch (error) {
      next.reject(error as Error)
    }
  }

  // ============================================================================
  // Private Methods - Metrics
  // ============================================================================

  private updateExecutionMetrics(executionTime: number): void {
    if (!this.options.enableMetrics) return

    this.executionTimes.push(executionTime)
    if (this.executionTimes.length > 100) {
      this.executionTimes = this.executionTimes.slice(-100)
    }
    this.updateAverageExecutionTime()
  }

  private updateAverageExecutionTime(): void {
    if (!this.options.enableMetrics || this.executionTimes.length === 0) return

    const total = this.executionTimes.reduce((a, b) => a + b, 0)
    const avg = total / this.executionTimes.length
    this.metrics.averageExecutionTime = avg

    bot.logger.debug("debug", `Updated average execution time: ${avg.toFixed(2)} ms`)
  }

  private updateConcurrencyMetrics(): void {
    if (this.options.enableMetrics) {
      this.metrics.peakConcurrency = Math.max(this.metrics.peakConcurrency, this.activeProcesses.size)
    }
  }

  // ============================================================================
  // Private Methods - Error Handling
  // ============================================================================

  private categorizeError(error: Error): ProcessStatus {
    const msg = (error?.message ?? "").toLowerCase()

    // Check for exit codes in error message
    if (msg.includes("exit") && (msg.includes("152") || msg.includes("183") || msg.includes("255"))) {
      return "totalTerminated"
    }

    if (this.isTimeoutError(error)) return "totalTerminated"
    if (this.isTerminationError(error)) return "totalTerminated"
    return "totalFailed"
  }

  private isTimeoutError(error: Error): boolean {
    const msg = (error?.message ?? "").toLowerCase()
    return TIMEOUT_ERROR_PATTERNS.some((pattern) => msg.includes(pattern))
  }

  private isTerminationError(error: Error): boolean {
    const msg = (error?.message ?? "").toLowerCase()
    return TERMINATION_ERROR_PATTERNS.some((pattern) => msg.includes(pattern))
  }

  private handleError(processId: string, error: Error, context: string): void {
    bot.logger.error("error", `${context} error for ${processId}: ${error.message}`, {
      processId,
      context,
      isTimeout: this.isTimeoutError(error),
      isTermination: this.isTerminationError(error),
      stack: error.stack,
    })
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private emitProcessStarted(processId: string, command: SimpleFFmpeg): void {
    const pid = command.pid ?? "unknown"
    const cmdStr = command.toString?.() ?? "unknown"
    bot.logger.debug("debug", `Process started: ${processId} (PID: ${pid}) Command: ${cmdStr}`)
    this.emit("processStarted", { processId, pid: typeof pid === "number" ? pid : null })
  }

  private findProcessId(command: SimpleFFmpeg): string | null {
    for (const [id, info] of this.activeProcesses) {
      if (info.command === command) return id
    }
    return null
  }

  private generateProcessId(): string {
    return `ffmpeg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }

  // ============================================================================
  // Event Type Definitions
  // ============================================================================

  override on(event: "processStarted", listener: (data: { processId: string; pid: number | null }) => void): this
  override on(event: "processEnded", listener: (data: ProcessEndedEvent) => void): this
  override on(event: "error", listener: (data: ProcessErrorEvent) => void): this
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }
}

export { FFmpegManager as default }
