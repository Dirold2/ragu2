import { EventEmitter } from "events";
import { Module } from "./Module.js";
import { ModuleHealth } from "./ModuleHealth.js";
import { ModuleConfig, ModuleConfigData } from "./ModuleConfig.js";
import { createLogger } from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { dirname } from "dirname-filename-esm";
import { ModuleState, type ModuleConstructor } from "../types/index.js";
import { ModuleMemoryInspector } from "./ModuleMemoryInspector.js";

const __dirname = dirname(import.meta);

/**
 * Options for the ModuleManager constructor
 */
interface ModuleManagerOptions {
	modulesPath?: string;
	configPath?: string;
	autoStart?: boolean;
}

/**
 * Manages the lifecycle of all modules in the application.
 * Handles loading, initialization, starting, and stopping modules.
 */
export class ModuleManager extends EventEmitter {
	private modules: Map<string, Module> = new Map();
	private initialized = false;
	private modulesPath: string;
	private logger = createLogger("core");
	private startupTimestamp = 0;
	private moduleLoadPromises: Map<string, Promise<"loaded" | "disabled">> =
		new Map();
	private health: ModuleHealth;
	private config: ModuleConfig;
	private autoStart: boolean;
	private memoryInspector: ModuleMemoryInspector;

	/**
	 * Creates a new ModuleManager instance
	 * @param options Configuration options
	 */
	constructor(options?: ModuleManagerOptions) {
		super();
		this.modulesPath =
			options?.modulesPath || path.resolve(__dirname, "../modules");
		this.health = new ModuleHealth();
		this.config = new ModuleConfig(options?.configPath);
		this.autoStart = options?.autoStart ?? true;

		// Создаем инспектор памяти с отключенным автозапуском
		this.memoryInspector = new ModuleMemoryInspector(this, {
			autoStart: false,
		});

		// Подписываемся на события инспектора памяти
		this.memoryInspector.on("memoryLeakDetected", (results) => {
			this.logger.warn(`Detected ${results.length} potential memory leaks`);

			// Можно добавить дополнительные действия, например, отправку уведомлений
			this.emit("memoryLeaks", results);
		});

		// Set up error handling
		this.on("error", this.handleManagerError.bind(this));
		this.on("moduleError", (error, moduleName, operation) => {
			this.emit("error", error, moduleName, operation);
		});
	}

	/**
	 * Load all modules from the modules directory
	 */
	public async loadModules(): Promise<void> {
		this.startupTimestamp = performance.now();

		this.logger.info({
			message: "Starting module discovery...",
			moduleState: ModuleState.STARTING,
		});

		try {
			// Load module configurations first
			await this.config.loadAllConfigs();

			// Get all directories in the modules path
			const files = await fs.readdir(this.modulesPath);
			const moduleDirectories = await Promise.all(
				files.map(async (file) => {
					const fullPath = path.join(this.modulesPath, file);
					try {
						const stat = await fs.stat(fullPath);
						return stat.isDirectory() ? file : null;
					} catch (e) {
						this.logger.error({
							message: `Failed to load module from ${fullPath}: ${e}`,
							error: e,
							moduleState: ModuleState.ERROR,
						});
						return null;
					}
				}),
			);

			// Filter out null values
			const validDirectories = moduleDirectories.filter(
				(dir): dir is string => dir !== null,
			);

			let loadedCount = 0;
			let disabledCount = 0;
			let errorCount = 0;

			// Load modules in parallel for better performance
			await Promise.all(
				validDirectories.map(async (dir) => {
					try {
						// Check if we're already loading this module
						if (this.moduleLoadPromises.has(dir)) {
							await this.moduleLoadPromises.get(dir);
							return;
						}

						// Determine file extension based on environment
						const isDevMode = process.env.NODE_ENV === "development";
						const moduleFileName = `module.${isDevMode ? "ts" : "js"}`;
						const modulePath = String(
							pathToFileURL(path.join(this.modulesPath, dir, moduleFileName)),
						);

						// Create and store the loading promise
						const loadPromise = this.loadModuleFromPath(modulePath, dir);
						this.moduleLoadPromises.set(dir, loadPromise);

						// Wait for module to load
						const result = await loadPromise;

						if (result === "loaded") {
							loadedCount++;
						} else if (result === "disabled") {
							disabledCount++;
						}
					} catch (error) {
						errorCount++;
						this.logger.error({
							message: `Failed to load module from ${dir}: ${error}`,
							error,
							moduleState: ModuleState.ERROR,
						});
						throw error;
					}
				}),
			);

			const elapsedTime = (performance.now() - this.startupTimestamp).toFixed(
				2,
			);
			this.logger.info({
				message: `Module discovery completed in ${elapsedTime}ms: ${loadedCount} loaded, ${disabledCount} disabled, ${errorCount} failed`,
				moduleState: loadedCount > 0 ? ModuleState.STARTING : ModuleState.ERROR,
			});

			// Validate dependencies
			this.validateDependencies();
		} catch (error) {
			this.logger.error({
				message: "Failed to load modules:",
				error,
				moduleState: ModuleState.ERROR,
			});
			throw error;
		}
	}

	/**
	 * Load a module from a specific path
	 * @returns "loaded" if module was loaded, "disabled" if module was disabled
	 */
	private async loadModuleFromPath(
		modulePath: string,
		dir: string,
	): Promise<"loaded" | "disabled"> {
		try {
			const moduleImport = await import(modulePath);
			const ModuleClass = moduleImport.default;

			if (!ModuleClass || !(ModuleClass.prototype instanceof Module)) {
				this.logger.warn({
					message: `Invalid module in ${dir}: Module class must extend the base Module class`,
					moduleState: ModuleState.WARNING,
				});
				throw new Error(`Invalid module in ${dir}: Not a Module subclass`);
			}

			const module = new ModuleClass();

			// Важно: устанавливаем ссылку на ModuleManager сразу после создания модуля
			module.setModuleManager(this);

			// Check if module is disabled in config or metadata
			const moduleConfig = this.config.getConfig(module.name);
			const isDisabled = module.disabled || moduleConfig.disabled === true;

			if (isDisabled) {
				if (process.env.LOG_LEVEL === "debug") {
					this.logger.debug(`Module ${module.name} is disabled, skipping`);
				}
				return "disabled";
			}

			await this.registerModule(module);
			return "loaded";
		} catch (error) {
			this.logger.error({
				message: `Error loading module from ${modulePath}:`,
				error,
				moduleState: ModuleState.ERROR,
			});
			throw error;
		}
	}

	/**
	 * Register a module with the manager
	 */
	public async registerModule(module: Module): Promise<void> {
		if (this.modules.has(module.name)) {
			throw new Error(`Module ${module.name} is already registered`);
		}

		if (module.disabled) {
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(
					`Module ${module.name} is disabled, skipping registration`,
				);
			}
			return;
		}

		// Set up error handling for the module
		module.on("error", (error: Error, operation: string) => {
			this.health.trackError(module);
			this.emit("moduleError", error, module.name, operation);
		});

		// Set up state change handling
		module.on(
			"stateChange",
			(newState: ModuleState, previousState: ModuleState) => {
				if (process.env.LOG_LEVEL === "debug") {
					this.logger.debug(
						`Module ${module.name} state changed: ${previousState} -> ${newState}`,
					);
				}
			},
		);

		// Важно: устанавливаем ссылку на ModuleManager еще раз для гарантии
		module.setModuleManager(this);

		this.modules.set(module.name, module);

		// Only log in debug mode
		if (process.env.LOG_LEVEL === "debug") {
			this.logger.debug(`Registered module: ${module.name}`);
		}
	}

	/**
	 * Validate that all module dependencies can be satisfied
	 */
	private validateDependencies(): void {
		const moduleNames = new Set(this.modules.keys());
		let hasErrors = false;

		for (const [name, module] of this.modules.entries()) {
			for (const dependency of module.dependencies) {
				if (!moduleNames.has(dependency)) {
					this.logger.warn(
						`Module ${name} depends on ${dependency}, but it's not available`,
					);
					hasErrors = true;
				}
			}
		}

		if (hasErrors) {
			this.logger.warn(
				"Some module dependencies could not be satisfied. This may cause issues during initialization.",
			);
		}
	}

	/**
	 * Initialize all modules in dependency order
	 */
	public async initializeModules(): Promise<void> {
		if (this.initialized) {
			this.logger.warn({
				message: "ModuleManager is already initialized",
				moduleState: ModuleState.WARNING,
			});
			return;
		}

		this.logger.info({
			message: "Initializing modules...",
			moduleState: ModuleState.INITIALIZED,
		});

		const sortedModules = this.sortModulesByDependencies();
		const totalModules = sortedModules.length;
		let initializedCount = 0;
		let errorCount = 0;

		// Initialize modules sequentially in dependency order
		for (const module of sortedModules) {
			try {
				const currentState = module.getState();
				if (currentState === ModuleState.INITIALIZED) {
					initializedCount++;
					continue;
				}

				// Track initialization performance
				this.health.trackStart(module, "initialize");
				await module.initialize();
				this.health.trackEnd(
					module,
					"initialize",
					module.getState() === ModuleState.INITIALIZED,
				);

				initializedCount++;
			} catch (error) {
				errorCount++;
				this.logger.error({
					message: `Failed to initialize module: ${module.name}`,
					moduleState: ModuleState.ERROR,
					error,
				});
				this.emit("moduleError", error, module.name, "initialization");
			}
		}

		this.initialized = true;
		const elapsedTime = (performance.now() - this.startupTimestamp).toFixed(2);
		this.logger.info({
			message: `Module initialization completed in ${elapsedTime}ms: ${initializedCount}/${totalModules} initialized`,
			moduleState: ModuleState.INITIALIZED,
		});

		if (errorCount > 0) {
			this.logger.warn({
				message: `${errorCount} modules failed to initialize`,
				moduleState: ModuleState.WARNING,
			});
		}

		// Запустить инспектор памяти после инициализации модулей
		if (!this.memoryInspector.isRunning()) {
			this.memoryInspector.start();
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(
					"Module memory inspector started after initialization",
				);
			}
		}

		// Auto-start modules if configured
		if (this.autoStart) {
			await this.startModules();
		}
	}

	/**
	 * Start all modules in dependency order
	 */
	public async startModules(): Promise<void> {
		if (!this.initialized) {
			throw new Error(
				"ModuleManager must be initialized before starting modules",
			);
		}

		const sortedModules = this.sortModulesByDependencies();
		const totalModules = sortedModules.length;
		let startedCount = 0;
		let errorCount = 0;

		this.logger.info({
			message: "Starting modules...",
			moduleState: ModuleState.STARTING,
		});

		for (const module of sortedModules) {
			try {
				const currentState = module.getState();
				if (currentState === ModuleState.RUNNING) {
					startedCount++;
					continue;
				}

				if (
					currentState !== ModuleState.INITIALIZED &&
					currentState !== ModuleState.STOPPED
				) {
					this.logger.warn({
						message: `Cannot start module ${module.name} from state ${currentState}`,
						moduleState: currentState,
					});
					continue;
				}

				this.health.trackStart(module, "start");
				await module.start();
				this.health.trackEnd(
					module,
					"start",
					module.getState() === ModuleState.RUNNING,
				);

				if (module.getState() !== ModuleState.RUNNING) {
					throw new Error(`Module ${module.name} failed to start properly`);
				}

				startedCount++;
			} catch (error) {
				errorCount++;
				this.logger.error({
					message: `Failed to start module: ${module.name}`,
					moduleState: ModuleState.ERROR,
					error,
				});
				this.emit("moduleError", error, module.name, "start");
			}
		}

		const elapsedTime = (performance.now() - this.startupTimestamp).toFixed(2);
		this.logger.info({
			message: `Module startup completed in ${elapsedTime}ms: ${startedCount}/${totalModules} started`,
			moduleState:
				startedCount === totalModules
					? ModuleState.STARTING
					: ModuleState.ERROR,
		});

		if (errorCount > 0) {
			this.logger.warn({
				message: `${errorCount} modules failed to start`,
				moduleState: ModuleState.ERROR,
			});
		}

		this.emit("ready", this.getModuleStatus());
	}

	/**
	 * Stop all modules in reverse dependency order
	 */
	public async stopModules(): Promise<void> {
		// Остановить инспектор памяти перед остановкой модулей
		if (this.memoryInspector.isRunning()) {
			this.memoryInspector.stop();
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(
					"Module memory inspector stopped before module shutdown",
				);
			}
		}

		// Reverse the order to stop modules in the correct order
		const sortedModules = this.sortModulesByDependencies().reverse();
		const totalModules = sortedModules.length;
		let stoppedCount = 0;
		let errorCount = 0;

		this.logger.info({
			message: "Stopping modules...",
			moduleState: ModuleState.STOPPING,
		});

		for (const module of sortedModules) {
			try {
				const currentState = module.getState();
				if (currentState !== ModuleState.RUNNING) {
					this.logger.debug(
						`Module ${module.name} is not running (state: ${currentState}), skipping`,
					);
					continue;
				}

				// Track stop operation
				this.health.trackStart(module, "stop");
				await module.stop();
				this.health.trackEnd(
					module,
					"stop",
					module.getState() === ModuleState.STOPPED,
				);

				stoppedCount++;
				this.logger.debug(
					`Stopped module ${stoppedCount}/${totalModules}: ${module.name}`,
				);
			} catch (error) {
				errorCount++;
				this.logger.error({
					message: `Failed to stop module: ${module.name}`,
					moduleState: ModuleState.ERROR,
					error,
				});

				// Continue with other modules instead of throwing
				this.emit("moduleError", error, module.name, "stop");
			}
		}

		this.initialized = false;
		this.logger.info({
			message: `Module shutdown completed: ${stoppedCount} stopped, ${errorCount} failed`,
			moduleState: ModuleState.STOPPED,
		});
	}

	/**
	 * Sort modules by dependencies using topological sort
	 */
	private sortModulesByDependencies(): Module[] {
		const visited = new Set<string>();
		const sorted: Module[] = [];
		const visiting = new Set<string>();

		const visit = (moduleName: string) => {
			if (visited.has(moduleName)) return;
			if (visiting.has(moduleName)) {
				const cycle = Array.from(visiting).join(" -> ") + " -> " + moduleName;
				throw new Error(`Circular dependency detected: ${cycle}`);
			}

			visiting.add(moduleName);
			const module = this.modules.get(moduleName);
			if (!module) {
				throw new Error(`Module ${moduleName} not found`);
			}

			for (const depName of module.dependencies) {
				if (this.modules.has(depName)) {
					visit(depName);
				}
			}

			visiting.delete(moduleName);
			visited.add(moduleName);
			sorted.push(module);
		};

		// First sort modules by priority (higher priority first)
		const modulesByPriority = Array.from(this.modules.entries()).sort(
			([, a], [, b]) => (b.priority || 0) - (a.priority || 0),
		);

		for (const [moduleName] of modulesByPriority) {
			if (!visited.has(moduleName)) {
				visit(moduleName);
			}
		}

		return sorted;
	}

	/**
	 * Get a module by name with type safety
	 * @example getModule<typeof import("../modules/bot/module.js").default>("bot")
	 */
	public getModule<T extends Module>(name: string): T | undefined {
		return this.modules.get(name) as T | undefined;
	}

	/**
	 * Get the status of all modules
	 */
	public getModuleStatus(): Array<{
		name: string;
		state: ModuleState;
		stateText: string;
		disabled: boolean;
		dependencies: string[];
		version: string;
		hasError: boolean;
		metrics?: {
			initTime?: number;
			startTime?: number;
			errorCount: number;
		};
	}> {
		return Array.from(this.modules.entries()).map(([name, module]) => {
			const metrics = this.health.getModuleMetrics(name);

			return {
				name,
				state: module.getState(),
				stateText: module.getState(),
				disabled: module.disabled,
				dependencies: module.dependencies,
				version: module.version,
				hasError: module.hasError(),
				metrics: metrics
					? {
							initTime:
								metrics.operations.initialize.count > 0
									? metrics.operations.initialize.totalDuration /
										metrics.operations.initialize.count
									: undefined,
							startTime:
								metrics.operations.start.count > 0
									? metrics.operations.start.totalDuration /
										metrics.operations.start.count
									: undefined,
							errorCount: metrics.errorCount,
						}
					: undefined,
			};
		});
	}

	/**
	 * Get exports from a module with type safety
	 * @example getModuleExports<typeof import("../modules/bot/module.js").default["exports"]>("bot")
	 */
	public getModuleExports<T>(moduleName: string): T | undefined {
		const module = this.modules.get(moduleName);
		return module ? (module.exports as T) : undefined;
	}

	/**
	 * Handle errors from the module manager
	 */
	private handleManagerError(
		error: Error,
		moduleName?: string,
		operation?: string,
	): void {
		this.logger.error(
			`ModuleManager error${moduleName ? ` in module ${moduleName}` : ""}${operation ? ` during ${operation}` : ""}:`,
			error,
		);
	}

	/**
	 * Restart a specific module
	 */
	public async restartModule(moduleName: string): Promise<void> {
		const module = this.modules.get(moduleName);
		if (!module) {
			throw new Error(`Module ${moduleName} not found`);
		}

		this.logger.info(`Restarting module: ${moduleName}`);
		await module.restart();
		this.logger.info(`Module ${moduleName} restarted successfully`);
	}

	/**
	 * Create a new module instance and register it
	 */
	public async createModule<T extends Module>(
		ModuleClass: ModuleConstructor<T>,
		options?: Record<string, unknown>,
	): Promise<T> {
		const module = new ModuleClass(options);
		await this.registerModule(module);

		if (this.initialized) {
			// If manager is already initialized, initialize and start the new module
			await module.initialize();
			await module.start();
		}

		return module;
	}

	/**
	 * Get all modules
	 */
	public getAllModules(): Module[] {
		return Array.from(this.modules.values());
	}

	/**
	 * Get modules by state
	 */
	public getModulesByState(state: ModuleState): Module[] {
		return this.getAllModules().filter((module) => module.getState() === state);
	}

	/**
	 * Check if all modules are in the running state
	 */
	public areAllModulesRunning(): boolean {
		return this.getAllModules().every(
			(module) => module.getState() === ModuleState.RUNNING || module.disabled,
		);
	}

	/**
	 * Get modules with errors
	 */
	public getModulesWithErrors(): Module[] {
		return this.getAllModules().filter((module) => module.hasError());
	}

	/**
	 * Clear all modules
	 */
	public clearModules(): void {
		this.modules.clear();
		this.initialized = false;
		this.logger.info("All modules have been cleared");
	}

	/**
	 * Get module health metrics
	 */
	public getHealthMetrics() {
		return this.health.getMetrics();
	}

	/**
	 * Get the slowest modules
	 */
	public getSlowestModules() {
		return this.health.getSlowestModules();
	}

	/**
	 * Get the most error-prone modules
	 */
	public getMostErrorProneModules() {
		return this.health.getMostErrorProneModules();
	}

	/**
	 * Get module configuration
	 */
	public getModuleConfig<T extends ModuleConfigData = ModuleConfigData>(
		moduleName: string,
	): T {
		return this.config.getConfig<T>(moduleName);
	}

	/**
	 * Update module configuration
	 */
	public async updateModuleConfig(
		moduleName: string,
		updates: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		return this.config.updateConfig(moduleName, updates);
	}

	/**
	 * Get the path to a module's directory
	 */
	public getModulePath(moduleName: string): string | undefined {
		// Возвращаем путь к директории модуля
		return path.join(this.modulesPath, moduleName);
	}

	/**
	 * Получает инспектор памяти модулей
	 */
	public getMemoryInspector(): ModuleMemoryInspector {
		return this.memoryInspector;
	}

	/**
	 * Запустить анализ памяти и вернуть результаты
	 */
	public async analyzeMemory(): Promise<{
		leaks: Array<{
			moduleName: string;
			severity: "low" | "medium" | "high";
			growthRate: number;
			recommendation: string;
		}>;
		report: {
			totalHeapUsed: number;
			totalHeapTotal: number;
			moduleStats: Array<{
				moduleName: string;
				heapGrowth: number;
				growthRate: number;
				leakProbability: "none" | "low" | "medium" | "high";
			}>;
		};
	}> {
		// Убедимся, что инспектор запущен
		if (!this.memoryInspector.isRunning()) {
			this.memoryInspector.start();
		}

		// Сделать снимок
		this.memoryInspector.takeSnapshot();

		// Подождать немного для более точных результатов
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Сделать еще один снимок
		this.memoryInspector.takeSnapshot();

		// Проанализировать использование памяти
		const leaks = this.memoryInspector.analyzeMemoryUsage();

		// Сгенерировать отчет
		const report = this.memoryInspector.generateMemoryReport();

		return {
			leaks: leaks.map((leak) => ({
				moduleName: leak.moduleName,
				severity: leak.severity,
				growthRate: leak.growthRate,
				recommendation: leak.recommendation,
			})),
			report: {
				totalHeapUsed: report.totalHeapUsed,
				totalHeapTotal: report.totalHeapTotal,
				moduleStats: report.moduleStats,
			},
		};
	}

	/**
	 * Очистить все снимки памяти
	 */
	public clearMemorySnapshots(): void {
		this.memoryInspector.clearSnapshots();
	}
}
