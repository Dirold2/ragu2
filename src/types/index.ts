import type { Logger as WinstonLogger } from "winston";
import type { Locale } from "../utils/locale.js";

export type ModuleExports = ModuleExportsMap[keyof ModuleExportsMap];

export interface ModuleConfig {
	readonly name: keyof ModuleExportsMap;
	readonly description: string;
	readonly version: string;
	readonly dependencies: (keyof ModuleExportsMap)[];
	readonly exports: ModuleExports;
}

export interface ModuleConstructor {
	new (): BaseModule;
}

// Базовый тип для всех модулей
export enum ModuleState {
	UNINITIALIZED = "UNINITIALIZED",
	INITIALIZING = "INITIALIZING",
	INITIALIZED = "INITIALIZED",
	STARTING = "STARTING",
	RUNNING = "RUNNING",
	STOPPING = "STOPPING",
	STOPPED = "STOPPED",
	ERROR = "ERROR",
}

export interface ModuleMetadata {
	readonly name: string;
	readonly description: string;
	readonly version: string;
	readonly dependencies?: string[];
	readonly disabled?: boolean;
	readonly priority?: number;
}

// Определяем тип для логгера на основе winston
export interface Logger extends WinstonLogger {
	playerError(error: unknown, url?: string): void;
}

// Используем тип Locale из utils/locale.ts
export type I18n = Locale;

export interface BaseModule {
	readonly metadata: ModuleMetadata;
	readonly exports?: Record<string, unknown>;
	readonly state: ModuleState;
	readonly logger: Logger;
	readonly locale: I18n;

	initialize(): Promise<void>;
	start(): Promise<void>;
	stop(): Promise<void>;
	restart(): Promise<void>;

	getState(): ModuleState;
	getError(): Error | null;
}

// Тип для объединения всех модулей
export type ModuleExportsMap = {
	[ModuleName: string]: Record<string, unknown>;
};

// Обновляем интерфейс I18nOptions
export interface I18nOptions<T = any> {
	category: keyof T;
	params?: Record<string, string | number>;
}

export interface ModuleTranslations {
	[category: string]: {
		[key: string]: any;
	};
}

// Изменим утилитарный тип, чтобы он работал с BaseModule
export type ModuleExportsType<T extends BaseModule> = T extends {
	exports: infer E;
}
	? E
	: never;
