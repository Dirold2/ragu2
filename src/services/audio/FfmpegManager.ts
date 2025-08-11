import { EventEmitter } from "eventemitter3";
import {
	SimpleFFmpeg,
	type SimpleFFmpegOptions,
} from "./SimpleFfmpegWrapper.js";
import { bot } from "../../bot.js";

export interface FFmpegManagerOptions {
	maxConcurrentProcesses?: number;
	defaultTimeout?: number;
	enableMetrics?: boolean;
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

export class FFmpegManager extends EventEmitter {
	private activeProcesses = new Map<
		string,
		{
			command: SimpleFFmpeg;
			startTime: Date;
			timeout?: NodeJS.Timeout;
		}
	>();

	private processQueue: Array<{
		id: string;
		factory: () => SimpleFFmpeg;
		resolve: (command: SimpleFFmpeg) => void;
		reject: (error: Error) => void;
	}> = [];

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
			defaultTimeout: options.defaultTimeout ?? 300000, // 5 minutes
			enableMetrics: options.enableMetrics ?? true,
			logger: bot.logger ?? console,
		};
	}

	async createCommand(
		commandOptions: SimpleFFmpegOptions = {},
	): Promise<SimpleFFmpeg> {
		const processId = this.generateProcessId();

		if (this.activeProcesses.size >= this.options.maxConcurrentProcesses) {
			return new Promise((resolve, reject) => {
				this.processQueue.push({
					id: processId,
					factory: () => this.createCommandInternal(processId, commandOptions),
					resolve,
					reject,
				});
				this.options.logger.debug(
					`[FFmpegManager] Process queued: ${processId}`,
				);
			});
		}

		return this.createCommandInternal(processId, commandOptions);
	}

	private createCommandInternal(
		processId: string,
		commandOptions: SimpleFFmpegOptions,
	): SimpleFFmpeg {
		const command = new SimpleFFmpeg({
			...commandOptions,
			loggerTag: commandOptions.loggerTag ?? processId,
			// Forward manager logger to the SimpleFFmpeg instance unless explicitly provided
			logger: commandOptions.logger ?? this.options.logger,
		});

		const startTime = new Date();
		const processInfo = {
			command,
			startTime,
			timeout:
				this.options.defaultTimeout > 0
					? setTimeout(
							() => this.handleTimeout(processId),
							this.options.defaultTimeout,
						)
					: undefined,
		};

		this.activeProcesses.set(processId, processInfo);
		this.updateMetrics("created");

		const cleanup = (
			reason: string,
			status: "completed" | "failed" | "terminated",
		) => {
			const info = this.activeProcesses.get(processId);
			if (info) {
				if (info.timeout) {
					clearTimeout(info.timeout);
				}

				const executionTime = Date.now() - info.startTime.getTime();
				if (this.options.enableMetrics) {
					this.executionTimes.push(executionTime);
					this.updateAverageExecutionTime();
				}

				this.activeProcesses.delete(processId);
				this.updateMetrics(status);
				this.options.logger.debug(
					`[FFmpegManager] Process ${processId} removed: ${reason}`,
				);

				this.emit("processEnded", {
					id: processId,
					reason,
					status,
					executionTime,
				});

				this.processNextInQueue();
			}
		};

		// Enhanced event handling
		command.once("end", () => cleanup("natural end", "completed"));
		command.once("close", () => cleanup("close", "completed"));
		command.once("exit", () => cleanup("exit", "completed"));

		command.on("error", (error: Error) => {
			if (!this.isTerminationError(error)) {
				cleanup("error", "failed");
				this.emit("error", { processId, error });
			} else {
				cleanup("terminated", "terminated");
				this.options.logger.debug(
					`[FFmpegManager] Process ${processId} terminated: ${error.message}`,
				);
			}
		});

		// Track peak concurrency
		if (this.options.enableMetrics) {
			const currentConcurrency = this.activeProcesses.size;
			if (currentConcurrency > this.metrics.peakConcurrency) {
				this.metrics.peakConcurrency = currentConcurrency;
			}
		}

		this.emit("processStarted", {
			id: processId,
			pid: command.pid,
			startTime,
			command: command.toString?.() ?? "unknown",
		});

		return command;
	}

	private processNextInQueue(): void {
		if (
			this.processQueue.length > 0 &&
			this.activeProcesses.size < this.options.maxConcurrentProcesses
		) {
			const next = this.processQueue.shift()!;
			try {
				const command = next.factory();
				next.resolve(command);
			} catch (error) {
				next.reject(error as Error);
			}
		}
	}

	private handleTimeout(processId: string): void {
		const info = this.activeProcesses.get(processId);
		if (info) {
			this.options.logger.warn(
				`[FFmpegManager] Process ${processId} timed out, terminating`,
			);
			this.terminateProcess(info.command).catch((err) => {
				this.options.logger.error(
					`[FFmpegManager] Failed to terminate timed out process ${processId}:`,
					err,
				);
			});
		}
	}

	private isTerminationError(error: Error): boolean {
		const msg = error.message.toLowerCase();
		return [
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
		].some((pattern) => msg.includes(pattern));
	}

	async terminateProcess(
		command: SimpleFFmpeg,
		signal: NodeJS.Signals = "SIGTERM",
	): Promise<void> {
		const processId = this.findProcessId(command);
		if (!processId) {
			this.options.logger.debug(
				"[FFmpegManager] Process not found or already terminated",
			);
			return;
		}

		this.options.logger.debug(
			`[FFmpegManager] Initiating termination for process ${processId}`,
		);

		return new Promise<void>((resolve) => {
			let finished = false;
			const finish = (reason: string) => {
				if (!finished) {
					finished = true;
					const info = this.activeProcesses.get(processId);
					if (info?.timeout) {
						clearTimeout(info.timeout);
					}
					this.activeProcesses.delete(processId);
					this.options.logger.debug(
						`[FFmpegManager] Termination complete for ${processId}: ${reason}`,
					);
					resolve();
				}
			};

			const cleanupListeners = () => {
				command.off("error", errorHandler);
				command.off("end", endHandler);
				command.off("close", closeHandler);
				command.off("exit", exitHandler);
			};

			const errorHandler = (error: Error) => {
				this.options.logger.debug(
					`[FFmpegManager] Error during termination of ${processId}: ${error.message}`,
				);
				cleanupListeners();
				finish("error");
			};

			const endHandler = () => {
				cleanupListeners();
				finish("end");
			};

			const closeHandler = () => {
				cleanupListeners();
				finish("close");
			};

			const exitHandler = () => {
				cleanupListeners();
				finish("exit");
			};

			command.on("error", errorHandler);
			command.once("end", endHandler);
			command.once("close", closeHandler);
			command.once("exit", exitHandler);

			try {
				this.options.logger.debug(
					`[FFmpegManager] Sending ${signal} to process ${processId}`,
				);
				command.kill(signal);

				// Escalate to SIGKILL if needed
				if (signal !== "SIGKILL") {
					setTimeout(() => {
						if (!finished) {
							this.options.logger.debug(
								`[FFmpegManager] Escalating to SIGKILL for process ${processId}`,
							);
							try {
								command.kill("SIGKILL");
							} catch (err) {
								this.options.logger.warn(
									`[FFmpegManager] SIGKILL failed for ${processId}:`,
									err,
								);
							}
						}
					}, 2000);
				}
			} catch (err) {
				this.options.logger.warn(
					`[FFmpegManager] Error sending signals to ${processId}:`,
					err,
				);
				cleanupListeners();
				finish("exception");
			}

			// Final timeout
			setTimeout(() => {
				if (!finished) {
					this.options.logger.warn(
						`[FFmpegManager] Termination timeout for process ${processId}`,
					);
					cleanupListeners();
					finish("timeout");
				}
			}, 5000);
		});
	}

	async terminateAll(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
		const processes = Array.from(this.activeProcesses.values()).map(
			(info) => info.command,
		);
		this.options.logger.debug(
			`[FFmpegManager] Terminating all (${processes.length}) processes`,
		);

		// Clear the queue
		this.processQueue.forEach((item) => {
			item.reject(new Error("Manager is terminating all processes"));
		});
		this.processQueue.length = 0;

		const results = await Promise.allSettled(
			processes.map((p) => this.terminateProcess(p, signal)),
		);

		results.forEach((res, i) => {
			if (res.status === "rejected") {
				this.options.logger.warn(
					`[FFmpegManager] Failed to terminate process #${i}:`,
					res.reason,
				);
			}
		});
	}

	// Utility methods
	private findProcessId(command: SimpleFFmpeg): string | null {
		for (const [id, info] of this.activeProcesses) {
			if (info.command === command) {
				return id;
			}
		}
		return null;
	}

	private generateProcessId(): string {
		return `ffmpeg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	private updateMetrics(
		type: "created" | "completed" | "failed" | "terminated",
	): void {
		if (!this.options.enableMetrics) return;

		switch (type) {
			case "created":
				this.metrics.totalCreated++;
				break;
			case "completed":
				this.metrics.totalCompleted++;
				break;
			case "failed":
				this.metrics.totalFailed++;
				break;
			case "terminated":
				this.metrics.totalTerminated++;
				break;
		}
	}

	private updateAverageExecutionTime(): void {
		if (this.executionTimes.length === 0) return;

		const sum = this.executionTimes.reduce((a, b) => a + b, 0);
		this.metrics.averageExecutionTime = sum / this.executionTimes.length;

		// Keep only last 100 execution times to prevent memory leak
		if (this.executionTimes.length > 100) {
			this.executionTimes = this.executionTimes.slice(-100);
		}
	}

	// Public getters
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
			status: "running" as const,
		}));
	}

	async waitForAll(): Promise<void> {
		const promises = Array.from(this.activeProcesses.values()).map(
			(info) => info.command.done,
		);
		await Promise.allSettled(promises);
	}

	// Health check
	isHealthy(): boolean {
		const failureRate =
			this.metrics.totalCreated > 0
				? this.metrics.totalFailed / this.metrics.totalCreated
				: 0;

		return (
			failureRate < 0.1 &&
			this.activeProcesses.size <= this.options.maxConcurrentProcesses
		);
	}
}
