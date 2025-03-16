import { EventEmitter } from "events";
import type { BaseModule, ModuleMetadata } from "../types/index.js";
import { ModuleState } from "../types/index.js";
import { createLogger, createLocale } from "../utils/index.js";

export abstract class Module extends EventEmitter implements BaseModule {
	protected _state: ModuleState = ModuleState.UNINITIALIZED;
	protected _error: Error | null = null;
	protected _imports: Record<string, unknown> = {};
	protected _logger: ReturnType<typeof createLogger>;
	protected _locale: ReturnType<typeof createLocale>;
	private _moduleInitialized = false;

	public abstract readonly metadata: ModuleMetadata;
	public readonly exports?: Record<string, unknown>;

	constructor() {
		super();
		// Получаем имя модуля из пути к файлу
		const moduleName = this.getModuleName();
		this._logger = createLogger(moduleName);
		this._locale = createLocale(moduleName);
	}

	private getModuleName(): string {
		// Получаем путь к файлу модуля из стека
		const stack = new Error().stack?.split("\n");
		const modulePath = stack
			?.find((line) => line.includes("/modules/"))
			?.match(/\/modules\/([^/]+)\//)?.[1];

		return modulePath || "core";
	}

	// Геттеры для логгера и локализации
	public get logger() {
		if (!this._moduleInitialized && this.metadata?.name) {
			this._logger = createLogger(this.metadata.name);
			this._moduleInitialized = true;
		}
		return this._logger;
	}

	public get locale() {
		if (!this._moduleInitialized && this.metadata?.name) {
			this._locale = createLocale(this.metadata.name);
			this._moduleInitialized = true;
		}
		return this._locale;
	}

	// Геттеры для метаданных
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

	public async initialize(): Promise<void> {
		try {
			this.setState(ModuleState.INITIALIZING);
			await this.onInitialize();
			this.setState(ModuleState.INITIALIZED);
		} catch (error) {
			this.handleError("initialization", error);
			throw error;
		}
	}

	public async start(): Promise<void> {
		try {
			this.setState(ModuleState.STARTING);
			await this.onStart();
			this.setState(ModuleState.RUNNING);
		} catch (error) {
			this.handleError("start", error);
			throw error;
		}
	}

	public async stop(): Promise<void> {
		try {
			this.setState(ModuleState.STOPPING);
			await this.onStop();
			this.setState(ModuleState.STOPPED);
		} catch (error) {
			this.handleError("stop", error);
			throw error;
		}
	}

	public async restart(): Promise<void> {
		await this.stop();
		await this.start();
	}

	public getState(): ModuleState {
		return this._state;
	}

	public getError(): Error | null {
		return this._error;
	}

	protected setState(state: ModuleState): void {
		this._state = state;
		this.emit("stateChange", state);
	}

	protected getModuleExports<T>(moduleName: string): T {
		const moduleExports = this._imports[moduleName];
		if (!moduleExports) {
			throw new Error(`Module ${moduleName} not found in imports`);
		}
		return moduleExports as T;
	}

	protected setImports(imports: Record<string, unknown>): void {
		this._imports = imports;
	}

	protected handleError(operation: string, error: unknown): void {
		this._error = error instanceof Error ? error : new Error(String(error));
		this.setState(ModuleState.ERROR);
		this.logger.error(`Error during module ${operation}:`, error);
	}

	// Абстрактные методы для переопределения в модулях
	protected async onInitialize(): Promise<void> {}
	protected async onStart(): Promise<void> {}
	protected async onStop(): Promise<void> {}
}
