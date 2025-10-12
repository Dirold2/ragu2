import { EventEmitter } from "eventemitter3";
import {
	SimpleFFmpeg,
	type SimpleFFmpegOptions,
} from "./SimpleFfmpegWrapper.js";

export interface FFmpegManagerOptions {
	maxConcurrentProcesses?: number;
	defaultTimeout?: number;
	enableMetrics?: boolean;
	timeoutRetries?: number;
	timeoutGracePeriod?: number;
	logger?: {
		debug: (message: string, meta?: any) => void;
		warn: (message: string, meta?: any) => void;
		error: (message: string, meta?: any) => void;
	};
}

export interface ProcessMetrics {
	totalCreated: number;
	totalCompleted: number;
	totalFailed: number;
	totalTerminated: number;
	averageExecutionTime: number;
	peakConcurrency: number;
}

export interface ProcessInfo {
	id: string;
	pid: number | null;
	startTime: Date;
	command: string;
	status: "running" | "completed" | "failed" | "terminated";
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
] as const;

const TIMEOUT_ERROR_PATTERNS = [
	"timeout",
	"operation timed out",
	"connection timeout",
	"request timeout",
] as const;

type ProcessStatus = "totalCompleted" | "totalFailed" | "totalTerminated";

interface ActiveProcess {
	command: SimpleFFmpeg;
	startTime: Date;
	timeout?: NodeJS.Timeout;
}

interface QueuedProcess {
	id: string;
	factory: () => SimpleFFmpeg;
	resolve: (command: SimpleFFmpeg) => void;
	reject: (error: Error) => void;
}

export class FFmpegManager extends EventEmitter {
	private activeProcesses = new Map<string, ActiveProcess>();
	private processQueue: QueuedProcess[] = [];
	private metrics: ProcessMetrics = {
		totalCreated: 0,
		totalCompleted: 0,
		totalFailed: 0,
		totalTerminated: 0,
		averageExecutionTime: 0,
		peakConcurrency: 0,
	};
	private executionTimes: number[] = [];
	private readonly options: Required<FFmpegManagerOptions>;

	constructor(options: FFmpegManagerOptions = {}) {
		super();
		this.options = {
			maxConcurrentProcesses: options.maxConcurrentProcesses ?? 5,
			defaultTimeout: options.defaultTimeout ?? 300_000,
			enableMetrics: options.enableMetrics ?? true,
			timeoutRetries: options.timeoutRetries ?? 1,
			timeoutGracePeriod: options.timeoutGracePeriod ?? 5_000,
			logger: options.logger ?? console,
		};
	}

	async createCommand(
		commandOptions: SimpleFFmpegOptions = {},
	): Promise<SimpleFFmpeg> {
		const processId = this.generateProcessId();

		if (this.activeProcesses.size >= this.options.maxConcurrentProcesses) {
			return this.queueProcess(processId, commandOptions);
		}

		return this.createCommandInternal(processId, commandOptions);
	}

	private queueProcess(
		processId: string,
		commandOptions: SimpleFFmpegOptions,
	): Promise<SimpleFFmpeg> {
		return new Promise((resolve, reject) => {
			const item: QueuedProcess = {
				id: processId,
				factory: () => this.createCommandInternal(processId, commandOptions),
				resolve,
				reject,
			};
			this.processQueue.push(item);
			this.options.logger.debug(`[FFmpegManager] Process queued: ${processId}`);
		});
	}

	private createCommandInternal(
		processId: string,
		commandOptions: SimpleFFmpegOptions,
	): SimpleFFmpeg {
		try {
			const command = new SimpleFFmpeg({
				...commandOptions,
				loggerTag: commandOptions.loggerTag ?? processId,
				logger: commandOptions.logger ?? this.options.logger,
			});

			this.setupProcess(processId, command);
			this.updateConcurrencyMetrics();
			this.emitProcessStarted(processId, command);

			return command;
		} catch (error) {
			this.handleError(processId, error as Error, "creation");
			throw error;
		}
	}

	private emitProcessStarted(processId: string, command: SimpleFFmpeg): void {
		this.options.logger.debug?.(
			`[FFmpegManager] Process started: ${processId} (PID: ${command.pid ?? "unknown"})`,
			{ tag: "FFmpegManager" },
		);
		this.emit("processStarted", { processId, pid: command.pid });
	}

	private setupProcess(processId: string, command: SimpleFFmpeg): void {
		const startTime = new Date();
		const processInfo: ActiveProcess = {
			command,
			startTime,
			timeout: this.createTimeout(processId),
		};

		this.activeProcesses.set(processId, processInfo);
		this.metrics.totalCreated++;
		this.setupEventHandlers(processId, command);
		this.updateConcurrencyMetrics();
	}

	private createTimeout(processId: string): NodeJS.Timeout | undefined {
		return this.options.defaultTimeout > 0
			? setTimeout(
					() => this.handleTimeout(processId),
					this.options.defaultTimeout,
				)
			: undefined;
	}

	private setupEventHandlers(processId: string, command: SimpleFFmpeg): void {
		const cleanup = (reason: string, status: ProcessStatus) =>
			this.cleanupProcess(processId, reason, status);

		const onComplete = () => cleanup("end", "totalCompleted");

		command.once("end", onComplete);
		command.once("close", onComplete);
		command.once("exit", onComplete);

		command.on("error", (error: Error) => {
			const status = this.categorizeError(error);
			cleanup("error", status);

			this.emit("error", {
				processId,
				error,
				status,
				isTimeout: this.isTimeoutError(error),
				isTermination: this.isTerminationError(error),
			});
		});
	}

	private categorizeError(error: Error): ProcessStatus {
		if (this.isTimeoutError(error)) return "totalTerminated";
		if (this.isTerminationError(error)) return "totalTerminated";
		return "totalFailed";
	}

	private isTimeoutError(error: Error): boolean {
		const msg = (error?.message ?? "").toLowerCase();
		return TIMEOUT_ERROR_PATTERNS.some((pattern) => msg.includes(pattern));
	}

	private cleanupProcess(
		processId: string,
		reason: string,
		status: ProcessStatus,
	): void {
		const info = this.activeProcesses.get(processId);
		if (!info) return;

		try {
			if (info.timeout) clearTimeout(info.timeout);

			const executionTime = Date.now() - info.startTime.getTime();
			this.updateExecutionMetrics(executionTime);

			this.activeProcesses.delete(processId);
			if (this.options.enableMetrics) {
				if (status === "totalCompleted") this.metrics.totalCompleted++;
				else if (status === "totalFailed") this.metrics.totalFailed++;
				else if (status === "totalTerminated") this.metrics.totalTerminated++;
			}

			this.options.logger.debug(
				`[FFmpegManager] Process ${processId} ${status}: ${reason}`,
			);

			this.emit("processEnded", {
				id: processId,
				reason,
				status,
				executionTime,
			});

			this.processNextInQueue();
		} catch (error) {
			this.handleError(processId, error as Error, "cleanup");
		}
	}

	private updateExecutionMetrics(executionTime: number): void {
		if (!this.options.enableMetrics) return;

		this.executionTimes.push(executionTime);
		if (this.executionTimes.length > 100)
			this.executionTimes = this.executionTimes.slice(-100);
		this.updateAverageExecutionTime();
	}

	private updateAverageExecutionTime(): void {
		if (!this.options.enableMetrics || this.executionTimes.length === 0) return;
		const total = this.executionTimes.reduce((a, b) => a + b, 0);
		const avg = total / this.executionTimes.length;
		this.metrics.averageExecutionTime = avg;
		this.options.logger.debug?.(
			`[FFmpegManager] Updated average execution time: ${avg.toFixed(2)} ms`,
			{ tag: "FFmpegManager" },
		);
	}

	private updateConcurrencyMetrics(): void {
		if (this.options.enableMetrics) {
			this.metrics.peakConcurrency = Math.max(
				this.metrics.peakConcurrency,
				this.activeProcesses.size,
			);
		}
	}

	private processNextInQueue(): void {
		if (
			this.processQueue.length === 0 ||
			this.activeProcesses.size >= this.options.maxConcurrentProcesses
		)
			return;

		const next = this.processQueue.shift()!;
		try {
			const command = next.factory();
			next.resolve(command);
		} catch (error) {
			next.reject(error as Error);
		}
	}

	private handleTimeout(processId: string): void {
		const info = this.activeProcesses.get(processId);
		if (!info) return;

		const executionTime = Date.now() - info.startTime.getTime();

		this.options.logger.warn(`[FFmpegManager] Process ${processId} timed out`, {
			processId,
			executionTime: `${Math.round(executionTime / 1000)}s`,
			timeout: `${this.options.defaultTimeout / 1000}s`,
			command: info.command.toString?.() ?? "unknown",
		});

		this.terminateProcessGracefully(processId, info.command).catch((err) =>
			this.handleError(processId, err, "timeout termination"),
		);
	}

	private async terminateProcessGracefully(
		processId: string,
		command: SimpleFFmpeg,
	): Promise<void> {
		try {
			await Promise.race([
				this.terminateProcess(command, "SIGTERM"),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("Graceful termination timeout")),
						this.options.timeoutGracePeriod,
					),
				),
			]);
		} catch {
			this.options.logger.warn(
				`[FFmpegManager] Force killing process ${processId}`,
			);
			await this.terminateProcess(command, "SIGKILL");
		}
	}

	async terminateProcess(
		command: SimpleFFmpeg,
		signal: NodeJS.Signals = "SIGTERM",
	): Promise<void> {
		const processId = this.findProcessId(command);
		if (!processId) return;

		this.options.logger.debug(
			`[FFmpegManager] Terminating process ${processId} with ${signal}`,
		);

		return new Promise<void>((resolve) => {
			let resolved = false;
			const finish = (_event: string) => {
				if (resolved) return;
				resolved = true;
				this.cleanupTermination(processId);
				resolve();
			};

			const events = ["error", "end", "close", "exit"] as const;
			events.forEach((event) =>
				command.once(event as any, () => finish(event)),
			);

			this.sendTerminationSignal(command, processId, signal, finish);
		});
	}

	private sendTerminationSignal(
		command: SimpleFFmpeg,
		processId: string,
		signal: NodeJS.Signals,
		finish: (reason: string) => void,
	): void {
		try {
			command.kill(signal);

			if (signal !== "SIGKILL") {
				setTimeout(() => {
					try {
						command.kill("SIGKILL");
					} catch (err) {
						this.options.logger.warn(
							`[FFmpegManager] Failed to send SIGKILL to ${processId}:`,
							err,
						);
					}
				}, 2000);
			}

			setTimeout(() => finish("force_timeout"), 5000);
		} catch (err) {
			this.handleError(processId, err as Error, "signal_sending");
			finish("signal_error");
		}
	}

	private handleError(processId: string, error: Error, context: string): void {
		this.options.logger.error(
			`[FFmpegManager] ${context} error for ${processId}:`,
			{
				processId,
				context,
				error: error.message,
				isTimeout: this.isTimeoutError(error),
				isTermination: this.isTerminationError(error),
				stack: error.stack,
			},
		);
	}

	private isTerminationError(error: Error): boolean {
		const msg = (error?.message ?? "").toLowerCase();
		return TERMINATION_ERROR_PATTERNS.some((pattern) => msg.includes(pattern));
	}

	async terminateAll(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
		const processes = Array.from(this.activeProcesses.values()).map(
			(info) => info.command,
		);
		this.options.logger.debug(
			`[FFmpegManager] Terminating all ${processes.length} processes`,
		);

		this.processQueue.forEach((item) =>
			item.reject(new Error("Manager terminating all processes")),
		);
		this.processQueue.length = 0;

		const results = await Promise.allSettled(
			processes.map((p) => this.terminateProcess(p, signal)),
		);

		results.forEach((result, index) => {
			if (result.status === "rejected") {
				this.options.logger.warn(
					`[FFmpegManager] Failed to terminate process #${index}:`,
					result.reason,
				);
			}
		});
	}

	private cleanupTermination(processId: string): void {
		const info = this.activeProcesses.get(processId);
		if (info?.timeout) clearTimeout(info.timeout);
		this.activeProcesses.delete(processId);
	}

	private findProcessId(command: SimpleFFmpeg): string | null {
		for (const [id, info] of this.activeProcesses) {
			if (info.command === command) return id;
		}
		return null;
	}

	private generateProcessId(): string {
		return `ffmpeg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	getActiveProcessCount(): number {
		return this.activeProcesses.size;
	}

	getQueuedProcessCount(): number {
		return this.processQueue.length;
	}

	getMetrics(): ProcessMetrics {
		return { ...this.metrics };
	}

	getActiveProcesses(): ProcessInfo[] {
		return Array.from(this.activeProcesses.entries()).map(([id, info]) => ({
			id,
			pid: info.command.pid,
			startTime: info.startTime,
			command: info.command.toString?.() ?? "unknown",
			status: "running",
		}));
	}

	async waitForAll(): Promise<void> {
		const promises = Array.from(this.activeProcesses.values()).map(
			(info) => info.command.done,
		);
		await Promise.allSettled(promises);
	}

	isHealthy(): boolean {
		const { totalCreated, totalFailed, totalTerminated } = this.metrics;
		const failureRate = totalCreated > 0 ? totalFailed / totalCreated : 0;
		const terminationRate =
			totalCreated > 0 ? totalTerminated / totalCreated : 0;

		return (
			failureRate < 0.1 &&
			terminationRate < 0.2 &&
			this.activeProcesses.size <= this.options.maxConcurrentProcesses
		);
	}
}

export { FFmpegManager as default };
