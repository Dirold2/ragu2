import { EventEmitter } from "events";
import { Module } from "./Module.js";
import { ModuleHealth } from "./ModuleHealth.js";
import { ModuleConfig } from "./ModuleConfig.js";
import { createLogger } from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { dirname } from "dirname-filename-esm";
import { ModuleState, type ModuleConstructor } from "../types/index.js";
import { clear } from "console";

const __dirname = dirname(import.meta);

/**
 * Manages the lifecycle of all modules in the application.
 * Handles loading, initialization, starting, and stopping modules.
 */
export class ModuleManager extends EventEmitter {
	private modules: Map<string, Module>;
	private initialized: boolean;
	private modulesPath: string;
	private logger = createLogger("ModuleManager");
	private startupTimestamp = 0;
	private moduleLoadPromises: Map<string, Promise<void>> = new Map();
	private health: ModuleHealth;
	private config: ModuleConfig;

	constructor(options?: { modulesPath?: string; configPath?: string }) {
		super();
		this.modules = new Map();
		this.initialized = false;
		this.modulesPath =
			options?.modulesPath || path.resolve(__dirname, "../modules");
		this.health = new ModuleHealth();
		this.config = new ModuleConfig(options?.configPath);

		// Set up error handling
		this.on("error", this.handleManagerError.bind(this));

		// Handle process termination signals
		process.on("SIGINT", this.handleShutdown.bind(this));
		process.on("SIGTERM", this.handleShutdown.bind(this));
	}

	/**
	 * Load all modules from the modules directory
	 */
	public async loadModules(): Promise<void> {
		this.startupTimestamp = Date.now();

		// Clear console for better visibility during startup
		if (process.env.NODE_ENV !== "test") {
			clear();
		}

		// Load module configurations
		await this.config.loadAllConfigs();

		this.logger.info({
			message: "Starting module discovery...",
			moduleState: ModuleState.INITIALIZING,
		});

		try {
			const files = await fs.readdir(this.modulesPath);
			const moduleDirectories = (
				await Promise.all(
					files.map(async (file) => {
						const fullPath = path.join(this.modulesPath, file);
						const stat = await fs.stat(fullPath);
						return stat.isDirectory() ? file : null;
					}),
				)
			).filter((dir): dir is string => dir !== null);

			let loadedCount = 0;
			const disabledCount = 0;
			let errorCount = 0;

			// Load modules in parallel
			const loadPromises = moduleDirectories.map(async (dir) => {
				const isDevMode = process.env.NODE_ENV === "development";
				const moduleFileName = `module.${isDevMode ? "ts" : "js"}`;
				const modulePath = String(
					pathToFileURL(path.join(this.modulesPath, dir, moduleFileName)),
				);

				try {
					if (this.moduleLoadPromises.has(dir)) {
						return this.moduleLoadPromises.get(dir);
					}

					const loadPromise = this.loadModuleFromPath(modulePath, dir);
					this.moduleLoadPromises.set(dir, loadPromise);

					await loadPromise;
					loadedCount++;
				} catch (error) {
					errorCount++;
					this.logger.error({
						message: `Failed to load module from ${dir}:`,
						error,
						moduleState: ModuleState.ERROR,
					});
				}
			});

			await Promise.all(loadPromises);

			this.logger.info({
				message: `Module discovery: ${loadedCount} loaded, ${disabledCount} disabled, ${errorCount} failed`,
				moduleState:
					loadedCount > 0 ? ModuleState.INITIALIZED : ModuleState.ERROR,
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
	 */
	private async loadModuleFromPath(
		modulePath: string,
		dir: string,
	): Promise<void> {
		try {
			const moduleImport = await import(modulePath);
			const ModuleClass = moduleImport.default;

			if (!ModuleClass || !(ModuleClass.prototype instanceof Module)) {
				this.logger.warn({
					message: `Invalid module in ${dir}: Module class must extend the base Module class`,
					moduleState: ModuleState.WARNING,
				});
				return;
			}

			const module = new ModuleClass();

			// Check if module is disabled in config
			const moduleConfig = this.config.getConfig(module.name);
			const isDisabled = module.disabled || moduleConfig.disabled === true;

			if (isDisabled) {
				return;
			}

			await this.registerModule(module);
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
			moduleState: ModuleState.INITIALIZING,
		});

		const sortedModules = this.sortModulesByDependencies();
		const totalModules = sortedModules.length;
		let initializedCount = 0;
		let errorCount = 0;

		for (const module of sortedModules) {
			try {
				const currentState = module.getState();
				if (currentState === ModuleState.INITIALIZED) {
					initializedCount++;
					continue;
				}

				await module.initialize();
				initializedCount++;
			} catch (error) {
				errorCount++;
				this.logger.error({
					message: `Failed to initialize module: ${module.name.toUpperCase()}`,
					moduleState: ModuleState.ERROR,
					error,
				});
				this.emit(
					"moduleError",
					error,
					module.name.toUpperCase(),
					"initialization",
				);
			}
		}

		this.initialized = true;
		const elapsedTime = Date.now() - this.startupTimestamp;
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
					message: `Failed to start module: ${module.name.toUpperCase()}`,
					moduleState: ModuleState.ERROR,
					error,
				});
				this.emit("moduleError", error, module.name.toUpperCase(), "start");
			}
		}

		const elapsedTime = Date.now() - this.startupTimestamp;
		this.logger.info({
			message: `Module startup completed in ${elapsedTime}ms: ${startedCount}/${totalModules} started`,
			moduleState:
				startedCount === totalModules ? ModuleState.RUNNING : ModuleState.ERROR,
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
		// Reverse the order to stop modules in the correct order
		const sortedModules = this.sortModulesByDependencies().reverse();
		const totalModules = sortedModules.length;
		let stoppedCount = 0;
		let errorCount = 0;

		this.logger.info("Stopping modules...");

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

				// Track end of stop operation
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
					message: `Failed to stop module: ${module.name.toUpperCase()}`,
					moduleState: ModuleState.ERROR,
					error,
				});

				// Continue with other modules instead of throwing
				this.emit("moduleError", error, module.name.toUpperCase(), "stop");
			}
		}

		this.initialized = false;
		this.logger.info(
			`Module shutdown completed: ${stoppedCount} stopped, ${errorCount} failed`,
		);
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
				hasError: module.getError() !== null,
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
	 * Get exports from a module
	 */
	public getModuleExports<T = unknown>(moduleName: string): T | undefined {
		const module = this.modules.get(moduleName);
		if (!module) {
			this.logger.warn(
				`Attempted to get exports from non-existent module: ${moduleName}`,
			);
			return undefined;
		}

		if (
			module.getState() !== ModuleState.RUNNING &&
			module.getState() !== ModuleState.INITIALIZED
		) {
			this.logger.warn(
				`Attempted to get exports from module ${moduleName} in state ${module.getState()}`,
			);
		}

		return module.exports as T;
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
	 * Handle process shutdown signals
	 */
	private async handleShutdown(signal: string): Promise<void> {
		this.logger.info(`Received ${signal} signal, shutting down...`);
		try {
			await this.stopModules();
			this.logger.info("Shutdown complete");
			process.exit(0);
		} catch (error) {
			this.logger.error("Error during shutdown:", error);
			process.exit(1);
		}
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
	public getModuleConfig<T = Record<string, any>>(moduleName: string): T {
		return this.config.getConfig<T>(moduleName);
	}

	/**
	 * Update module configuration
	 */
	public async updateModuleConfig(
		moduleName: string,
		updates: Record<string, any>,
	): Promise<Record<string, any>> {
		return this.config.updateConfig(moduleName, updates);
	}
}
