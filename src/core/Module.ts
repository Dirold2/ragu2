import { EventEmitter } from "events";
import type { BaseModule, ModuleMetadata } from "../types/index.js";
import { ModuleState } from "../types/index.js";
import { createLogger, createLocale } from "../utils/index.js";

/**
 * Abstract base class for all modules in the application.
 * Provides lifecycle management, dependency injection, and error handling.
 *
 * @template TExports - Type of exports this module provides
 * @template TImports - Type of imports this module requires
 */
export abstract class Module<
		TExports extends Record<string, unknown> = Record<string, unknown>,
		TImports extends Record<string, unknown> = Record<string, unknown>,
	>
	extends EventEmitter
	implements BaseModule
{
	protected _state: ModuleState = ModuleState.UNINITIALIZED;
	protected _error: Error | null = null;
	protected _imports: TImports = {} as TImports;
	protected _logger: ReturnType<typeof createLogger>;
	protected _locale: ReturnType<typeof createLocale>;
	private _moduleInitialized = false;

	/**
	 * Module metadata must be defined by all concrete module implementations
	 */
	public abstract readonly metadata: ModuleMetadata;

	/**
	 * Optional exports that this module provides to other modules
	 */
	public readonly exports?: TExports;

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
	 * Extracts the module name from the stack trace
	 * This is a fallback method used before metadata is available
	 */
	private getModuleName(): string {
		try {
			const stack = new Error().stack?.split("\n");
			const modulePath = stack
				?.find((line) => line.includes("/modules/"))
				?.match(/\/modules\/([^/]+)\//)?.[1];

			return modulePath || "unknown-module";
		} catch (error) {
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

	/**
	 * Localization helper for this module
	 */
	public get locale() {
		if (!this._moduleInitialized && this.metadata?.name) {
			this._locale = createLocale(this.metadata.name);
			this._moduleInitialized = true;
		}
		return this._locale;
	}

	// Metadata accessors
	public get name(): string {
		return this.metadata.name;
	}

	public get description(): string {
		return this.metadata.description;
	}

	public get version(): string {
		return this.metadata.version;
	}

	public get dependencies(): string[] {
		return this.metadata.dependencies || [];
	}

	public get disabled(): boolean {
		return this.metadata.disabled || false;
	}

	public get priority(): number {
		return this.metadata.priority || 50;
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

		try {
			this.setState(ModuleState.INITIALIZING);

			// Only log initialization start in debug mode
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Initializing module ${this.name}...`);
			}

			// Call the module-specific initialization logic
			await this.onInitialize();

			this.setState(ModuleState.INITIALIZED);
			this.logger.info(`Module ${this.name} initialized`);
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

		try {
			this.setState(ModuleState.STARTING);

			// Only log start in debug mode
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Starting module ${this.name}...`);
			}

			// Call the module-specific start logic
			await this.onStart();

			this.setState(ModuleState.RUNNING);
			this.logger.info(`Module ${this.name} started`);
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

		try {
			this.setState(ModuleState.STOPPING);

			// Only log stop in debug mode
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Stopping module ${this.name}...`);
			}

			// Call the module-specific stop logic
			await this.onStop();

			this.setState(ModuleState.STOPPED);
			this.logger.info(`Module ${this.name} stopped`);
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
		// Remove redundant log
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
	 * Get exports from a dependency module
	 * @throws Error if the module is not found in imports
	 */
	protected getModuleExports<T>(moduleName: string): T {
		const moduleExports = this._imports[moduleName];
	
		if (!moduleExports) {
			const errorMessage = `Модуль ${moduleName.toUpperCase()} не найден в импортах. Проверьте, что он указан в зависимостях.`;
			
			// Log detailed error information
			this.logger.error({
				message: errorMessage,
				moduleState: ModuleState.ERROR,
				error: new Error(errorMessage),
			});
			
			// Дополнительные проверки и логирование
			if (!this.metadata?.dependencies?.includes(moduleName)) {
				this.logger.warn({
					message: `Модуль ${moduleName.toUpperCase()} не указан в зависимостях ${this.metadata?.name?.toUpperCase()}.`,
					moduleState: ModuleState.WARNING,
				});
			}
	
			if (Object.keys(this._imports).length === 0) {
				this.logger.warn({
					message: `В ${this.metadata.name.toUpperCase()} не было импортировано ни одного модуля.`,
					moduleState: ModuleState.WARNING,
				});
			}
			
			// Исключение выбрасывается только один раз
			throw new Error(errorMessage);
		}
	
		return moduleExports as T;
	}

	/**
	 * Set the imports for this module
	 * This is called by the ModuleManager during initialization
	 */
	protected setImports(imports: TImports): void {
		this._imports = imports;
	}

	/**
	 * Handle an error that occurred during module lifecycle
	 */
	protected handleError(operation: string, error: unknown): void {
		this._error = error instanceof Error ? error : new Error(String(error));
		this.setState(ModuleState.ERROR);

		// Log detailed error information
		this.logger.error({
			message: `Error during module ${operation} in ${this.name.toUpperCase()}:`,
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

	// Abstract methods to be implemented by concrete modules
	protected async onInitialize(): Promise<void> {}
	protected async onStart(): Promise<void> {}
	protected async onStop(): Promise<void> {}
}
