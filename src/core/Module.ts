import { EventEmitter } from "events";
import type { BaseModule, ModuleMetadata } from "../types/index.js";
import { ModuleState } from "../types/index.js";
import { createLogger, createLocale } from "../utils/index.js";
import path from "path";
import fs from "node:fs";
import type { ModuleManager } from "./ModuleManager.js";

/**
 * Abstract base class for all modules in the application.
 * Provides lifecycle management, dependency injection, and error handling.
 */
export abstract class Module extends EventEmitter implements BaseModule {
	protected _state: ModuleState = ModuleState.UNINITIALIZED;
	protected _error: Error | null = null;
	protected _logger: ReturnType<typeof createLogger>;
	protected _locale: ReturnType<typeof createLocale>;
	protected _localeImport?: Record<string, unknown>;
	private _moduleInitialized = false;
	private _startTime = 0;

	/**
	 * Reference to the ModuleManager for inter-module communication
	 */
	protected moduleManager?: ModuleManager;

	/**
	 * Module metadata must be defined by all concrete module implementations
	 */
	public abstract readonly metadata: ModuleMetadata;

	/**
	 * Optional exports that this module provides to other modules
	 */
	public readonly exports: Record<string, unknown> = {};

	constructor() {
		super();
		// Initialize logger and locale with a temporary name
		const moduleName = this.getModuleName();
		this._logger = createLogger(moduleName);
		this._locale = createLocale(moduleName);

		// Set up state change event listener
		this.on(
			"stateChange",
			(newState: ModuleState, previousState: ModuleState) => {
				if (process.env.LOG_LEVEL === "debug") {
					this._logger.debug(
						`Module state changed from ${previousState} to ${newState}`,
					);
				}
			},
		);
	}

	/**
	 * Set the ModuleManager reference for inter-module communication
	 */
	public setModuleManager(manager: ModuleManager): void {
		this.moduleManager = manager;

		// Добавим логирование для отладки
		if (process.env.LOG_LEVEL === "debug") {
			this.logger.debug(
				`ModuleManager reference set for module ${this.name || "unknown"}`,
			);
		}
	}

	/**
	 * Get a module instance by name with type safety using typeof import
	 * @example getModuleInstance<typeof import("../modules/bot/module.js").default>("bot")
	 */
	protected getModuleInstance<T extends Module>(
		moduleName: string,
	): T | undefined {
		if (!this.moduleManager) {
			this.logger.warn(
				`ModuleManager not available in ${this.name}, cannot get module ${moduleName}`,
			);
			return undefined;
		}
		return this.moduleManager.getModule<T>(moduleName);
	}

	/**
	 * Get exports from another module by name with type safety
	 * @example getExportsFromModule<typeof import("../modules/bot/module.js").default["exports"]>("bot")
	 */
	protected getExportsFromModule<T = unknown>(
		moduleName: string,
	): T | undefined {
		if (!this.moduleManager) {
			this.logger.warn(
				`ModuleManager not available in ${this.name}, cannot get exports from module ${moduleName}`,
			);
			return undefined;
		}
		return this.moduleManager.getModuleExports<T>(moduleName);
	}

	/**
	 * Extracts the module name from the stack trace
	 * This is a fallback method used before metadata is available
	 */
	private getModuleName(): string {
		try {
			// Получаем путь к директории модулей
			let modulesDir: string;

			if (typeof Bun !== "undefined") {
				// Bun environment
				modulesDir = path.resolve(
					path.dirname(Bun.fileURLToPath(import.meta.url)),
					"../modules",
				);
			} else {
				// Node environment
				modulesDir = path.resolve(
					path.dirname(new URL(import.meta.url).pathname),
					"../modules",
				);
			}

			// Получаем стек вызовов для определения вызывающего файла
			const stack = new Error().stack || "";
			const stackLines = stack.split("\n");

			// Ищем в стеке путь, который содержит /modules/
			for (const line of stackLines) {
				const match = line.match(/\/modules\/([^\/]+)/);
				if (match && match[1]) {
					return match[1];
				}
			}

			// Если не удалось найти по стеку, пробуем по списку модулей
			if (fs.existsSync(modulesDir)) {
				const moduleFolders = fs
					.readdirSync(modulesDir, { withFileTypes: true })
					.filter((dirent) => dirent.isDirectory())
					.map((dirent) => dirent.name);

				// Если есть только один модуль, возвращаем его
				if (moduleFolders.length === 1) {
					return moduleFolders[0];
				}
			}

			return "unknown-module";
		} catch (error) {
			console.error("Error extracting module name from file path:", error);
			return "unknown-module";
		}
	}

	/**
	 * Logger instance for this module
	 */
	public get logger() {
		if (!this._moduleInitialized && this.metadata?.name) {
			this._logger = createLogger(this.metadata.name);
			this._moduleInitialized = true;
		}
		return this._logger;
	}

	// /**
	//  * Localization helper for this module
	//  */
	// public get locale() {
	// 	if (!this._moduleInitialized && this.metadata?.name) {
	// 		type mm = this.moduleManager?.getModulePath(this.metadata.name)!;
	// 		const localePath = path.join(mm || "", "locales", "en.json");

	// 		this.logger.info(localePath);

	// 		// Создаем локализацию с именем модуля
	// 		// TODO: Добавить автоматическую загрузку локализаций из директории модуля
	// 		this._locale = createLocale<typeof import(`${mm as string}`)>(this.metadata.name);
	// 		this._moduleInitialized = true;
	// 	}
	// 	return this._locale;
	// }

	// Metadata accessors with defaults for safety
	public get name(): string {
		return this.metadata.name || "unnamed-module";
	}

	public get description(): string {
		return this.metadata.description || "";
	}

	public get version(): string {
		return this.metadata.version || "0.0.0";
	}

	public get dependencies(): string[] {
		return this.metadata.dependencies || [];
	}

	public get disabled(): boolean {
		return this.metadata.disabled || false;
	}

	public get priority(): number {
		return this.metadata.priority ?? 50; // Default priority is 50
	}

	public get state(): ModuleState {
		return this._state;
	}

	/**
	 * Initialize the module
	 * This is called by the ModuleManager during system startup
	 */
	public async initialize(): Promise<void> {
		if (this._state !== ModuleState.UNINITIALIZED) {
			this.logger.warn(
				`Module ${this.name} is already initialized or in progress (state: ${this._state})`,
			);
			return;
		}

		this._startTime = performance.now();

		try {
			this.setState(ModuleState.INITIALIZING);

			// Only log initialization start in debug mode
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Initializing module ${this.name}...`);
			}

			// Call the module-specific initialization logic
			await this.onInitialize();

			this.setState(ModuleState.INITIALIZED);

			const initTime = performance.now() - this._startTime;
			this.logger.info({
				message: `Module ${this.name} initialized in ${initTime.toFixed(2)}ms`,
				moduleState: ModuleState.INITIALIZED,
			});
		} catch (error) {
			this.handleError("initialization", error);
			throw error;
		}
	}

	/**
	 * Start the module
	 * This is called by the ModuleManager after all modules are initialized
	 */
	public async start(): Promise<void> {
		if (
			this._state !== ModuleState.INITIALIZED &&
			this._state !== ModuleState.STOPPED
		) {
			this.logger.warn(
				`Cannot start module ${this.name} from state ${this._state}`,
			);
			return;
		}

		this._startTime = performance.now();

		try {
			this.setState(ModuleState.STARTING);

			// Only log start in debug mode
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Starting module ${this.name}...`);
			}

			// Call the module-specific start logic
			await this.onStart();

			this.setState(ModuleState.RUNNING);

			const startTime = performance.now() - this._startTime;
			this.logger.info({
				message: `Module ${this.name} started in ${startTime.toFixed(2)}ms`,
				moduleState: ModuleState.STARTING,
			});
		} catch (error) {
			this.handleError("start", error);
			throw error;
		}
	}

	/**
	 * Stop the module
	 * This is called by the ModuleManager during system shutdown
	 */
	public async stop(): Promise<void> {
		if (this._state !== ModuleState.RUNNING) {
			this.logger.warn(
				`Cannot stop module ${this.name} from state ${this._state}`,
			);
			return;
		}

		this._startTime = performance.now();

		try {
			this.setState(ModuleState.STOPPING);

			// Only log stop in debug mode
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Stopping module ${this.name}...`);
			}

			// Call the module-specific stop logic
			await this.onStop();

			this.setState(ModuleState.STOPPED);

			const stopTime = performance.now() - this._startTime;
			this.logger.info(
				`Module ${this.name} stopped in ${stopTime.toFixed(2)}ms`,
			);
		} catch (error) {
			this.handleError("stop", error);
			throw error;
		}
	}

	/**
	 * Restart the module
	 */
	public async restart(): Promise<void> {
		this.logger.info(`Restarting module ${this.name}...`);
		await this.stop();
		await this.start();
		this.logger.info(`Module ${this.name} restarted successfully`);
	}

	/**
	 * Get the current state of the module
	 */
	public getState(): ModuleState {
		return this._state;
	}

	/**
	 * Get the last error that occurred in the module, if any
	 */
	public getError(): Error | null {
		return this._error;
	}

	/**
	 * Update the module state and emit a state change event
	 */
	protected setState(state: ModuleState): void {
		const previousState = this._state;
		this._state = state;

		// Only emit if the state actually changed
		if (previousState !== state) {
			this.emit("stateChange", state, previousState);
		}
	}

	/**
	 * Handle an error that occurred during module lifecycle
	 */
	protected handleError(operation: string, error: unknown): void {
		this._error = error instanceof Error ? error : new Error(String(error));
		this.setState(ModuleState.ERROR);

		// Log detailed error information
		this.logger.error({
			message: `Error during module ${operation} in ${this.name}:`,
			operation,
			error: this._error,
			stack: this._error.stack,
			moduleState: ModuleState.ERROR,
		});

		// Emit an error event that can be handled by the ModuleManager
		this.emit("error", this._error, operation);
	}

	/**
	 * Reset the module to its initial state
	 * This can be used to recover from errors
	 */
	public reset(): void {
		this._error = null;
		this.setState(ModuleState.UNINITIALIZED);
		this.logger.info(`Module ${this.name} has been reset`);
	}

	/**
	 * Check if the module is in a specific state
	 */
	public isInState(state: ModuleState): boolean {
		return this._state === state;
	}

	/**
	 * Check if the module is ready to be used
	 */
	public isReady(): boolean {
		return this._state === ModuleState.RUNNING;
	}

	/**
	 * Check if the module has an error
	 */
	public hasError(): boolean {
		return this._state === ModuleState.ERROR || this._error !== null;
	}

	/**
	 * Get uptime of the module in milliseconds
	 */
	public getUptime(): number {
		if (this._state !== ModuleState.RUNNING) {
			return 0;
		}
		return this._startTime > 0 ? performance.now() - this._startTime : 0;
	}

	// Abstract methods to be implemented by concrete modules
	protected async onInitialize(): Promise<void> {}
	protected async onStart(): Promise<void> {}
	protected async onStop(): Promise<void> {}
}
