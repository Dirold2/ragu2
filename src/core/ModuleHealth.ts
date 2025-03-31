import type { Module } from "./Module.js";
import type { ModuleState } from "../types/index.js";
import { createLogger } from "../utils/logger.js";

/**
 * Metrics for a module operation
 */
export interface OperationMetrics {
	count: number;
	totalDuration: number;
	failures: number;
	lastDuration?: number;
	avgDuration?: number;
}

/**
 * Metrics for a module
 */
export interface ModuleMetrics {
	name: string;
	operations: {
		initialize: OperationMetrics;
		start: OperationMetrics;
		stop: OperationMetrics;
	};
	lastState: ModuleState;
	errorCount: number;
	lastErrorTime?: number;
}

/**
 * Tracks health metrics for modules
 */
export class ModuleHealth {
	private startTimes: Map<string, number> = new Map();
	private metrics: Map<string, ModuleMetrics> = new Map();
	private logger = createLogger("ModuleHealth");

	constructor() {
		this.resetMetrics();
	}

	/**
	 * Reset all metrics
	 */
	public resetMetrics(): void {
		this.startTimes.clear();
		this.metrics.clear();
	}

	/**
	 * Track the start of a module operation
	 */
	public trackStart(
		module: Module,
		operation: "initialize" | "start" | "stop",
	): void {
		const key = `${module.name}:${operation}`;
		this.startTimes.set(key, performance.now());
	}

	/**
	 * Track the end of a module operation
	 */
	public trackEnd(
		module: Module,
		operation: "initialize" | "start" | "stop",
		success: boolean,
	): void {
		const key = `${module.name}:${operation}`;
		const startTime = this.startTimes.get(key);

		if (!startTime) {
			return;
		}

		const duration = performance.now() - startTime;
		this.startTimes.delete(key);

		// Get or create metrics for this module
		let moduleMetrics = this.metrics.get(module.name);
		if (!moduleMetrics) {
			moduleMetrics = this.createDefaultMetrics(module);
			this.metrics.set(module.name, moduleMetrics);
		}

		// Update metrics
		const opMetrics = moduleMetrics.operations[operation];
		opMetrics.count++;
		opMetrics.totalDuration += duration;
		opMetrics.lastDuration = duration;
		opMetrics.avgDuration = opMetrics.totalDuration / opMetrics.count;

		if (!success) {
			opMetrics.failures++;
			moduleMetrics.errorCount++;
			moduleMetrics.lastErrorTime = Date.now();
		}

		moduleMetrics.lastState = module.getState();

		// Log slow operations only if they're significantly slow (over 1 second)
		// and only in debug mode or if very slow (over 5 seconds)
		if (
			duration > 5000 ||
			(process.env.LOG_LEVEL === "debug" && duration > 1000)
		) {
			this.logger.warn(
				`Slow module operation: ${module.name}.${operation} took ${duration.toFixed(2)}ms`,
			);
		}
	}

	/**
	 * Track an error in a module
	 */
	public trackError(module: Module): void {
		let moduleMetrics = this.metrics.get(module.name);
		if (!moduleMetrics) {
			moduleMetrics = this.createDefaultMetrics(module);
			this.metrics.set(module.name, moduleMetrics);
		}

		moduleMetrics.errorCount++;
		moduleMetrics.lastErrorTime = Date.now();
		moduleMetrics.lastState = module.getState();
	}

	/**
	 * Create default metrics for a module
	 */
	private createDefaultMetrics(module: Module): ModuleMetrics {
		return {
			name: module.name,
			operations: {
				initialize: { count: 0, totalDuration: 0, failures: 0 },
				start: { count: 0, totalDuration: 0, failures: 0 },
				stop: { count: 0, totalDuration: 0, failures: 0 },
			},
			lastState: module.getState(),
			errorCount: 0,
		};
	}

	/**
	 * Get metrics for all modules
	 */
	public getMetrics(): ModuleMetrics[] {
		return Array.from(this.metrics.values());
	}

	/**
	 * Get metrics for a specific module
	 */
	public getModuleMetrics(moduleName: string): ModuleMetrics | undefined {
		return this.metrics.get(moduleName);
	}

	/**
	 * Get modules sorted by initialization time
	 */
	public getSlowestModules(): ModuleMetrics[] {
		return this.getMetrics()
			.filter((m) => m.operations.initialize.count > 0)
			.sort((a, b) => {
				const aAvg =
					a.operations.initialize.totalDuration / a.operations.initialize.count;
				const bAvg =
					b.operations.initialize.totalDuration / b.operations.initialize.count;
				return bAvg - aAvg;
			});
	}

	/**
	 * Get modules with the most errors
	 */
	public getMostErrorProneModules(): ModuleMetrics[] {
		return this.getMetrics()
			.filter((m) => m.errorCount > 0)
			.sort((a, b) => b.errorCount - a.errorCount);
	}

	/**
	 * Get overall system health status
	 */
	public getSystemHealth(): {
		healthy: boolean;
		errorCount: number;
		slowModules: number;
		metrics: {
			totalModules: number;
			totalErrors: number;
			avgInitTime: number;
			avgStartTime: number;
		};
	} {
		const metrics = this.getMetrics();
		const totalModules = metrics.length;
		const totalErrors = metrics.reduce((sum, m) => sum + m.errorCount, 0);

		let totalInitTime = 0;
		let initCount = 0;
		let totalStartTime = 0;
		let startCount = 0;

		metrics.forEach((m) => {
			if (m.operations.initialize.count > 0) {
				totalInitTime += m.operations.initialize.totalDuration;
				initCount += m.operations.initialize.count;
			}

			if (m.operations.start.count > 0) {
				totalStartTime += m.operations.start.totalDuration;
				startCount += m.operations.start.count;
			}
		});

		const avgInitTime = initCount > 0 ? totalInitTime / initCount : 0;
		const avgStartTime = startCount > 0 ? totalStartTime / startCount : 0;

		// Count modules that are significantly slower than average
		const slowThreshold = avgInitTime * 2;
		const slowModules = metrics.filter(
			(m) =>
				m.operations.initialize.avgDuration &&
				m.operations.initialize.avgDuration > slowThreshold,
		).length;

		return {
			healthy: totalErrors === 0,
			errorCount: totalErrors,
			slowModules,
			metrics: {
				totalModules,
				totalErrors,
				avgInitTime,
				avgStartTime,
			},
		};
	}
}
