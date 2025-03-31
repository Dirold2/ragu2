import type { Logger as WinstonLogger } from "winston";
import type { Locale } from "../utils/locale.js";

/**
 * Enhanced module state enum with string values for better logging
 */
export enum ModuleState {
	UNINITIALIZED = "UNINITIALIZED",
	INITIALIZING = "INITIALIZING",
	INITIALIZED = "INITIALIZED",
	STARTING = "STARTING",
	RUNNING = "RUNNING",
	STOPPING = "STOPPING",
	STOPPED = "STOPPED",
	ERROR = "ERROR",
	WARNING = "WARNING",
	DEBUG = "DEBUG",
}

/**
 * Module metadata interface
 */
export interface ModuleMetadata {
	readonly name: string;
	readonly description: string;
	readonly version: string;
	readonly dependencies?: string[];
	readonly disabled?: boolean;
	readonly priority?: number;
	readonly author?: string;
	readonly license?: string;
	readonly repository?: string;
}

/**
 * Extended logger interface based on Winston
 */
export interface Logger extends WinstonLogger {
	playerError(error: unknown, url?: string): void;
}

/**
 * Locale type alias
 */
export type I18n = Locale;

/**
 * Base module interface that all modules must implement
 */
export interface BaseModule {
	readonly metadata: ModuleMetadata;
	readonly exports?: Record<string, unknown>;
	readonly state: ModuleState;
	readonly logger: Logger;
	// readonly locale: I18n;

	initialize(): Promise<void>;
	start(): Promise<void>;
	stop(): Promise<void>;
	restart(): Promise<void>;

	getState(): ModuleState;
	getError(): Error | null;
}

/**
 * Constructor type for modules
 */
export interface ModuleConstructor<T extends BaseModule = BaseModule> {
	new (options?: Record<string, unknown>): T;
}

/**
 * Type for module exports map
 */
export type ModuleExportsMap = {
	[ModuleName: string]: Record<string, unknown>;
};

/**
 * Type for module exports
 */
export type ModuleExports = ModuleExportsMap[keyof ModuleExportsMap];

/**
 * Interface for module configuration
 */
export interface ModuleConfig {
	readonly name: keyof ModuleExportsMap;
	readonly description: string;
	readonly version: string;
	readonly dependencies: (keyof ModuleExportsMap)[];
	readonly exports: ModuleExports;
}

/**
 * Options for internationalization
 */
export interface I18nOptions<T = undefined> {
	category: keyof T;
	params?: Record<string, string | number>;
}

/**
 * Module translations interface
 */
export interface ModuleTranslations {
	[category: string]: {
		[key: string]: undefined;
	};
}

/**
 * Utility type to extract exports from a module
 */
export type ModuleExportsType<T extends BaseModule> = T extends {
	exports: infer E;
}
	? E
	: never;

/**
 * Events emitted by modules
 */
export interface ModuleEvents {
	stateChange: (newState: ModuleState, previousState: ModuleState) => void;
	error: (error: Error, operation: string) => void;
}

/**
 * Events emitted by the module manager
 */
export interface ModuleManagerEvents {
	ready: (
		moduleStatus: Array<{
			name: string;
			state: ModuleState;
			disabled: boolean;
			dependencies: string[];
			version: string;
			hasError: boolean;
		}>,
	) => void;

	error: (error: Error, moduleName?: string, operation?: string) => void;
	moduleError: (error: Error, moduleName: string, operation: string) => void;
}
