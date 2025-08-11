import { EventEmitter } from "eventemitter3";
import { bot } from "../bot.js";
import { Counter } from "prom-client";

// Metrics
const errorEventsTotal = new Counter({
	name: "app_error_events_total",
	help: "Total number of handled errors",
	labelNames: ["component", "operation", "severity"] as const,
});

const recoveryAttemptsTotal = new Counter({
	name: "app_recovery_attempts_total",
	help: "Total number of recovery attempts",
	labelNames: ["strategy", "component"] as const,
});

const recoverySuccessTotal = new Counter({
	name: "app_recovery_success_total",
	help: "Total number of successful recoveries",
	labelNames: ["strategy", "component"] as const,
});

export interface ErrorContext {
	component: string;
	operation: string;
	metadata?: Record<string, any>;
	timestamp: number;
	severity: "low" | "medium" | "high" | "critical";
}

export interface RecoveryStrategy {
	name: string;
	condition: (error: Error, context: ErrorContext) => boolean;
	handler: (error: Error, context: ErrorContext) => Promise<boolean>;
	maxRetries: number;
}

export class ErrorHandler extends EventEmitter {
	private static instance: ErrorHandler | null = null;
	private isShuttingDown = false;
	private errorHistory: Array<{ error: Error; context: ErrorContext }> = [];
	private recoveryStrategies: RecoveryStrategy[] = [];
	private cleanupTasks: Array<() => Promise<void>> = [];
	private circuitBreakers = new Map<
		string,
		{ failures: number; lastFailure: number; isOpen: boolean }
	>();

	private readonly MAX_ERROR_HISTORY = 100;
	private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
	private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

	private constructor() {
		super();
		this.setupGlobalHandlers();
		this.setupDefaultRecoveryStrategies();
	}

	static getInstance(): ErrorHandler {
		if (!ErrorHandler.instance) {
			ErrorHandler.instance = new ErrorHandler();
		}
		return ErrorHandler.instance;
	}

	private setupGlobalHandlers(): void {
		process.on("uncaughtException", (error) => {
			const msg = (error?.message || "").toLowerCase();
			// Ignore known benign stream/ffmpeg pipeline errors to reduce noise
			const ignorable = [
				"premature close",
				"err_stream_premature_close",
				"write after end",
				"epipe",
			];
			if (ignorable.some((p) => msg.includes(p))) {
				bot?.logger?.debug(
					`[ErrorHandler] Ignored uncaughtException: ${error.message}`,
				);
				return;
			}

			this.handleError(error, {
				component: "process",
				operation: "uncaughtException",
				timestamp: Date.now(),
				severity: "critical",
			});
		});

		process.on("unhandledRejection", (reason, promise) => {
			const error =
				reason instanceof Error ? reason : new Error(String(reason));
			this.handleError(error, {
				component: "process",
				operation: "unhandledRejection",
				metadata: { promise: promise.toString() },
				timestamp: Date.now(),
				severity: "high",
			});
		});

		process.on("SIGINT", () => this.gracefulShutdown("SIGINT"));
		process.on("SIGTERM", () => this.gracefulShutdown("SIGTERM"));
	}

	private setupDefaultRecoveryStrategies(): void {
		// Stream recovery strategy
		this.addRecoveryStrategy({
			name: "stream-recovery",
			condition: (error) => this.isStreamError(error),
			handler: async (_error, context) => {
				bot?.logger?.info(
					`[Recovery] Attempting stream recovery for ${context.component}`,
				);
				// Implement stream-specific recovery logic
				return true;
			},
			maxRetries: 3,
		});

		// Network recovery strategy
		this.addRecoveryStrategy({
			name: "network-recovery",
			condition: (error) => this.isNetworkError(error),
			handler: async (_error, context) => {
				bot?.logger?.info(
					`[Recovery] Attempting network recovery for ${context.component}`,
				);
				await this.delay(1000); // Wait before retry
				return true;
			},
			maxRetries: 5,
		});

		// FFmpeg recovery strategy
		this.addRecoveryStrategy({
			name: "ffmpeg-recovery",
			condition: (error) => this.isFFmpegError(error),
			handler: async (_error, context) => {
				bot?.logger?.info(
					`[Recovery] Attempting FFmpeg recovery for ${context.component}`,
				);
				// Restart FFmpeg processes if needed
				return true;
			},
			maxRetries: 2,
		});
	}

	public async handleError(
		error: Error,
		context: ErrorContext,
	): Promise<boolean> {
		// Add to error history
		this.errorHistory.push({ error, context });
		if (this.errorHistory.length > this.MAX_ERROR_HISTORY) {
			this.errorHistory.shift();
		}

		// Check circuit breaker
		const breakerKey = `${context.component}-${context.operation}`;
		if (this.isCircuitBreakerOpen(breakerKey)) {
			bot?.logger?.warn?.(
				`[ErrorHandler] Circuit breaker open for ${breakerKey}, skipping recovery`,
			);
			return false;
		}

		// Metrics: record error event
		try {
			errorEventsTotal
				.labels(context.component, context.operation, context.severity)
				.inc();
		} catch {}

		// Log error based on severity
		this.logError(error, context);

		// Attempt recovery if not critical
		if (context.severity !== "critical") {
			const recovered = await this.attemptRecovery(error, context);
			if (!recovered) {
				this.updateCircuitBreaker(breakerKey, false);
			} else {
				this.resetCircuitBreaker(breakerKey);
			}
			return recovered;
		}

		// For critical errors, run cleanup and emit event
		this.emit("criticalError", error, context);
		return false;
	}

	private async attemptRecovery(
		error: Error,
		context: ErrorContext,
	): Promise<boolean> {
		for (const strategy of this.recoveryStrategies) {
			if (strategy.condition(error, context)) {
				try {
					// Metrics: attempt
					try {
						recoveryAttemptsTotal
							.labels(strategy.name, context.component)
							.inc();
					} catch {}

					const success = await strategy.handler(error, context);
					if (success) {
						bot?.logger?.info?.(
							`[Recovery] Successfully recovered using strategy: ${strategy.name}`,
						);
						try {
							recoverySuccessTotal
								.labels(strategy.name, context.component)
								.inc();
						} catch {}
						return true;
					}
				} catch (recoveryError) {
					bot?.logger?.error?.(
						`[Recovery] Strategy ${strategy.name} failed: ${String(
							(recoveryError as Error)?.message ?? recoveryError,
						)}`,
					);
				}
			}
		}
		return false;
	}

	private isCircuitBreakerOpen(key: string): boolean {
		const breaker = this.circuitBreakers.get(key);
		if (!breaker) return false;

		if (breaker.isOpen) {
			const timeSinceLastFailure = Date.now() - breaker.lastFailure;
			if (timeSinceLastFailure > this.CIRCUIT_BREAKER_TIMEOUT) {
				breaker.isOpen = false;
				breaker.failures = 0;
				return false;
			}
			return true;
		}
		return false;
	}

	private updateCircuitBreaker(key: string, success: boolean): void {
		let breaker = this.circuitBreakers.get(key);
		if (!breaker) {
			breaker = { failures: 0, lastFailure: 0, isOpen: false };
			this.circuitBreakers.set(key, breaker);
		}

		if (success) {
			breaker.failures = 0;
			breaker.isOpen = false;
		} else {
			breaker.failures++;
			breaker.lastFailure = Date.now();
			if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
				breaker.isOpen = true;
				console.warn(`[ErrorHandler] Circuit breaker opened for ${key}`);
			}
		}
	}

	private resetCircuitBreaker(key: string): void {
		const breaker = this.circuitBreakers.get(key);
		if (breaker) {
			breaker.failures = 0;
			breaker.isOpen = false;
		}
	}

	private logError(error: Error, context: ErrorContext): void {
		const logLevel = this.getLogLevel(context.severity);
		const message = `[${context.component}:${context.operation}] ${error.message}`;

		const meta = {
			error: error.stack,
			context,
			timestamp: new Date(context.timestamp).toISOString(),
		};

		// Prefer specialized playerError for stream/ffmpeg errors
		try {
			const url =
				typeof context.metadata?.url === "string"
					? (context.metadata.url as string)
					: undefined;
			if (
				bot?.logger?.playerError &&
				(this.isStreamError(error) || this.isFFmpegError(error))
			) {
				bot.logger.playerError(error, url);
				return;
			}
		} catch {}

		try {
			if (bot?.logger && typeof (bot.logger as any)[logLevel] === "function") {
				(bot.logger as any)[logLevel](message, meta);
				return;
			}
		} catch {}

		// Fallback to console
		console[logLevel](message, meta);
	}

	private getLogLevel(severity: string): "debug" | "info" | "warn" | "error" {
		switch (severity) {
			case "low":
				return "debug";
			case "medium":
				return "info";
			case "high":
				return "warn";
			case "critical":
				return "error";
			default:
				return "error";
		}
	}

	private isStreamError(error: Error): boolean {
		const streamErrorPatterns = [
			"premature close",
			"stream destroyed",
			"write after end",
			"err_stream_premature_close",
			"connection reset",
			"broken pipe",
		];
		return streamErrorPatterns.some((pattern) =>
			error.message.toLowerCase().includes(pattern),
		);
	}

	private isNetworkError(error: Error): boolean {
		const networkErrorPatterns = [
			"enotfound",
			"econnrefused",
			"econnreset",
			"timeout",
			"network error",
			"connection failed",
		];
		return networkErrorPatterns.some((pattern) =>
			error.message.toLowerCase().includes(pattern),
		);
	}

	private isFFmpegError(error: Error): boolean {
		const ffmpegErrorPatterns = [
			"ffmpeg",
			"sigkill",
			"sigterm",
			"was killed",
			"process error",
		];
		return ffmpegErrorPatterns.some((pattern) =>
			error.message.toLowerCase().includes(pattern),
		);
	}

	public addRecoveryStrategy(strategy: RecoveryStrategy): void {
		this.recoveryStrategies.push(strategy);
	}

	public registerCleanupTask(task: () => Promise<void>): void {
		this.cleanupTasks.push(task);
	}

	private async gracefulShutdown(signal: string): Promise<void> {
		if (this.isShuttingDown) return;

		this.isShuttingDown = true;
		console.log(
			`[ErrorHandler] Received ${signal}, starting graceful shutdown...`,
		);

		try {
			await Promise.allSettled(this.cleanupTasks.map((task) => task()));
			console.log("[ErrorHandler] Graceful shutdown completed");
		} catch (error) {
			console.error("[ErrorHandler] Error during shutdown:", error);
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	public getErrorStats(): {
		total: number;
		bySeverity: Record<string, number>;
		byComponent: Record<string, number>;
	} {
		const stats = {
			total: this.errorHistory.length,
			bySeverity: {} as Record<string, number>,
			byComponent: {} as Record<string, number>,
		};

		for (const { context } of this.errorHistory) {
			stats.bySeverity[context.severity] =
				(stats.bySeverity[context.severity] || 0) + 1;
			stats.byComponent[context.component] =
				(stats.byComponent[context.component] || 0) + 1;
		}

		return stats;
	}

	static initialize(): void {
		ErrorHandler.getInstance();
	}
}
