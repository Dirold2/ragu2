import dayjs from "dayjs";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs/promises";
import { LRUCache } from "lru-cache";
import styles from "ansi-styles";
import callsites from "callsites";
import { config } from "@dotenvx/dotenvx";
import { resolve } from "path";
import { dirname } from "dirname-filename-esm/index.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Инициализация конфига и локали
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

config({ path: resolve(dirname(import.meta), "../../.env") });
dayjs.locale(process.env.LOG_LANG?.trim() || "en");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Типы и интерфейсы
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

declare module "winston" {
	interface Logger {
		playerError: (error: unknown, url?: string) => void;
	}
}

/**
 * @en Module states for logging context
 * @ru Состояния модулей для контекста логирования
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

interface LogMeta {
	url?: string;
	stack?: string;
	module?: string;
	state?: ModuleState;
	source?: string;
}

type ExtendedLogInfo = winston.Logform.TransformableInfo & LogMeta;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Константы конфигурации
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const logDir = process.env.LOG_DIR || "./logs";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const SHOW_SOURCE = process.env.SHOW_SOURCE !== "false";
const MAX_STACK_LENGTH = 3000;
const MAX_LOGGER_CACHE = 100;
const DEBUG_MODULES = new Set(
	(process.env.DEBUG_MODULES || "").split(",").filter(Boolean),
);
const DEBUG_EXCLUDE = new Set(
	(process.env.DEBUG_EXCLUDE || "").split(",").filter(Boolean),
);
const DEBUG_ALL = process.env.DEBUG_ALL === "true";

const CALLER_SKIP_PATTERNS: string[] = [
	"node_modules",
	"internal",
	"native",
	"winston",
];

const LEVEL_COLOR_OPEN: Record<string, string> = {
	error: styles.red.open,
	warn: styles.yellow.open,
	info: styles.blue.open,
	debug: styles.green.open,
};

const LEVEL_COLOR_CLOSE: Record<string, string> = {
	error: styles.red.close,
	warn: styles.yellow.close,
	info: styles.blue.close,
	debug: styles.green.close,
};

const logConfig = {
	maxSize: "20m",
	maxFiles: "14d",
	utc: false,
	zippedArchive: true,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Состояние логгера
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let baseLogger: winston.Logger | null = null;
let handlersRegistered = false;

const loggerCache = new LRUCache<string, winston.Logger>({
	max: MAX_LOGGER_CACHE,
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Утилиты для отладки
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isDebugEnabledForModule(module?: string): boolean {
	if (!module) return DEBUG_ALL;
	if (DEBUG_ALL) return !DEBUG_EXCLUDE.has(module);
	return DEBUG_MODULES.has(module);
}

function logDebugConfig(): void {
	const logger = getBaseLogger();
	const enabled =
		DEBUG_ALL && DEBUG_EXCLUDE.size === 0
			? "all modules"
			: DEBUG_MODULES.size > 0
				? Array.from(DEBUG_MODULES).join(", ")
				: "none";
	const excluded =
		DEBUG_EXCLUDE.size > 0 ? Array.from(DEBUG_EXCLUDE).join(", ") : "none";

	logger.debug(
		`Debug config loaded: enabled=[${enabled}], excluded=[${excluded}]`,
	);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Управление директорией логов
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function ensureLogDirExists(): Promise<void> {
	try {
		await fs.access(logDir);
	} catch {
		await fs.mkdir(logDir, { recursive: true });
	}
}

export const cleanupOldLogs = async (daysToKeep = 14): Promise<void> => {
	try {
		const entries = await fs.readdir(logDir);
		if (entries.length === 0) return;

		const now = Date.now();
		const maxAge = daysToKeep * 86400000;
		let deletedCount = 0;

		await Promise.all(
			entries.map(async (name) => {
				const filePath = path.join(logDir, name);
				try {
					const stat = await fs.stat(filePath);
					if (!stat.isFile()) return;

					if (now - stat.mtime.getTime() > maxAge) {
						await fs.unlink(filePath);
						deletedCount++;
					}
				} catch (err) {
					const logger = getBaseLogger();
					logger.debug(`Failed to cleanup ${name}: ${String(err)}`);
				}
			}),
		);

		if (deletedCount > 0) {
			const logger = getBaseLogger();
			logger.debug(
				`Cleaned up ${deletedCount} old log files (older than ${daysToKeep} days)`,
			);
		}
	} catch (err) {
		const logger = getBaseLogger();
		logger.warn(`Failed to read logDir: ${String(err)}`);
	}
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Форматирование логов
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function colorizeLevel(level: string): string {
	const lower = String(level).toLowerCase();
	const open = LEVEL_COLOR_OPEN[lower] || "";
	const close = LEVEL_COLOR_CLOSE[lower] || "";
	return `${open}${level}${close}`;
}

/**
 * Фильтр для отключения debug‑логов модулей, не включённых в DEBUG_MODULES/DEBUG_ALL
 */
const debugFilter = winston.format((info: ExtendedLogInfo) => {
	const level = String(info.level).toLowerCase();

	if (level === "debug" && !isDebugEnabledForModule(info.module)) {
		// Winston пропустит запись целиком
		return false;
	}

	return info;
});

/**
 * Оптимизированная добавка информации источника (caller info)
 * - Вызывает callsites() только один раз
 * - Ранний выход, если SHOW_SOURCE отключен
 * - Ограничивает stack до MAX_STACK_LENGTH
 */
const addCallerInfo = winston.format((info: ExtendedLogInfo) => {
	if (!SHOW_SOURCE) return info;

	try {
		const level = String(info.level || "").toLowerCase();
		// Добавляем source только для warn и error
		if (level !== "warn" && level !== "error") return info;

		const frames = callsites();
		let foundInSrc = false;

		// Сначала ищем в /src/ директории
		for (const frame of frames) {
			const filePath = frame.getFileName?.();
			if (!filePath) continue;

			const lower = filePath.toLowerCase();

			// Пропускаем systemные модули
			if (lower.startsWith("node:")) continue;
			if (CALLER_SKIP_PATTERNS.some((p) => lower.includes(p))) continue;

			const inSrc = lower.includes("/src/") || lower.includes("\\src\\");
			if (!inSrc) continue;

			const file = path.basename(filePath);
			const line = frame.getLineNumber?.();
			info.source = line ? `${file}:${line}` : file;
			foundInSrc = true;
			break;
		}

		// Если не нашли в /src/, берём первый файл вне node_modules
		if (!foundInSrc) {
			for (const frame of frames) {
				const filePath = frame.getFileName?.();
				if (!filePath) continue;

				const lower = filePath.toLowerCase();
				if (lower.startsWith("node:")) continue;
				if (CALLER_SKIP_PATTERNS.some((p) => lower.includes(p))) continue;

				const file = path.basename(filePath);
				const line = frame.getLineNumber?.();
				info.source = line ? `${file}:${line}` : file;
				break;
			}
		}
	} catch {
		// Игнорируем ошибки при получении caller info
	}

	return info;
});

/**
 * Основной форматтер для сборки строки логов
 */
const createFormatter = (opts: { colorizeLevelName: boolean }) =>
	winston.format.combine(
		debugFilter(),
		winston.format.printf((info: ExtendedLogInfo) => {
			const timestamp = info.timestamp as string;
			const levelStr = opts.colorizeLevelName
				? colorizeLevel(info.level)
				: String(info.level);

			let modulePart = "";
			if (info.module) modulePart += `| [${info.module}]`;
			if (info.state) modulePart += ` (${info.state})`;

			let out = `${timestamp} ${modulePart} | ${levelStr}: ${info.message}`;

			if (info.url) out += ` url=${info.url}`;

			if (info.stack) {
				const stack =
					info.stack.length > MAX_STACK_LENGTH
						? `${info.stack.slice(0, MAX_STACK_LENGTH)}...[truncated]`
						: info.stack;
				out += `\n${stack}`;
			}

			if (SHOW_SOURCE && info.source) out += ` | ${info.source}`;

			return out;
		}),
	);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Инициализация логгера
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Инициализирует базовый логгер с транспортами.
 * Должен быть вызван один раз из точки входа приложения.
 * @param options.registerHandlers - Регистрировать ли обработчики сигналов и ошибок
 */
export function initLogger(options?: {
	registerHandlers?: boolean;
}): winston.Logger {
	if (baseLogger) return baseLogger;

	void ensureLogDirExists();

	const logger = winston.createLogger({
		level: LOG_LEVEL,
		exitOnError: false,
		defaultMeta: {},
		transports: [
			new DailyRotateFile({
				...logConfig,
				filename: `${logDir}/application-%DATE%.log`,
				format: winston.format.combine(
					winston.format.timestamp({ format: "DD.MM.YYYY HH:mm:ss" }),
					winston.format.errors({ stack: true }),
					createFormatter({ colorizeLevelName: false }),
				),
			}),
			new DailyRotateFile({
				...logConfig,
				filename: `${logDir}/error-%DATE%.log`,
				level: "error",
				format: winston.format.combine(
					winston.format.timestamp({ format: "DD.MM.YYYY HH:mm:ss" }),
					winston.format.errors({ stack: true }),
					createFormatter({ colorizeLevelName: false }),
				),
			}),
			new winston.transports.File({
				filename: `${logDir}/player-error.log`,
				level: "error",
				format: winston.format.combine(
					winston.format.timestamp({ format: "DD.MM.YYYY HH:mm:ss" }),
					winston.format.errors({ stack: true }),
					createFormatter({ colorizeLevelName: false }),
				),
			}),
		],
	}) as winston.Logger;

	// Добавляем console transport только в разработке
	if (process.env.NODE_ENV !== "production") {
		logger.add(
			new winston.transports.Console({
				handleExceptions: false,
				handleRejections: false,
				format: winston.format.combine(
					winston.format.timestamp({ format: "DD.MM.YYYY HH:mm:ss" }),
					winston.format.errors({ stack: true }),
					addCallerInfo(),
					createFormatter({ colorizeLevelName: true }),
				),
			}),
		);
	}

	// Добавляем метод playerError
	logger.playerError = function (error: unknown, url?: string) {
		const message = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? error.stack : undefined;
		const truncatedStack =
			stack && stack.length > MAX_STACK_LENGTH
				? `${stack.slice(0, MAX_STACK_LENGTH)}...[truncated]`
				: stack;

		this.error(message, { url, stack: truncatedStack });
	};

	baseLogger = logger;

	if (options?.registerHandlers) {
		registerErrorHandlers();
		logDebugConfig();
	}

	return logger;
}

/**
 * Получить базовый логгер, инициализирует его при необходимости
 */
export function getBaseLogger(): winston.Logger {
	return baseLogger ?? initLogger();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Фабрика логгеров для модулей
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Создаёт или возвращает кэшированный логгер для модуля
 * @param nameModule - Имя модуля (например, "Player", "Server")
 * @param moduleState - Состояние модуля (enum ModuleState)
 * @returns winston.Logger с методом playerError
 */
export function createLogger(
	nameModule?: string,
	moduleState?: ModuleState,
): winston.Logger {
	const key = `${nameModule ?? "default"}:${moduleState ?? ""}`;
	const cached = loggerCache.get(key);
	if (cached) return cached;

	const logger = getBaseLogger().child({
		module: nameModule || "",
		state: moduleState,
	}) as winston.Logger;

	// Копируем метод playerError в дочерний логгер
	logger.playerError = function (error: unknown, url?: string) {
		const message = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? error.stack : undefined;
		const truncatedStack =
			stack && stack.length > MAX_STACK_LENGTH
				? `${stack.slice(0, MAX_STACK_LENGTH)}...[truncated]`
				: stack;

		this.error(message, { url, stack: truncatedStack });
	};

	loggerCache.set(key, logger);
	return logger;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Обработчики сигналов и ошибок
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Graceful shutdown логгера
 */
async function shutdownLogger(signal: string): Promise<void> {
	try {
		const logger = getBaseLogger();
		logger.info(`Graceful shutdown initiated (${signal})`);

		await new Promise<void>((resolve) => {
			logger.on("finish", () => resolve());
			logger.end();
		});
	} catch (error) {
		console.error("Error during logger shutdown:", error);
	}
}

/**
 * Регистрирует обработчики для unhandledRejection, uncaughtException и сигналов
 */
function registerErrorHandlers(): void {
	if (handlersRegistered) return;
	handlersRegistered = true;

	// Обработчики сигналов для graceful shutdown
	["SIGINT", "SIGTERM"].forEach((signal) => {
		process.once(signal, () => {
			void shutdownLogger(signal);
		});
	});

	// unhandledRejection
	process.on("unhandledRejection", (reason) => {
		try {
			const logger = getBaseLogger();
			const msg =
				reason instanceof Error
					? reason.stack || reason.message
					: String(reason);
			logger.error(`UNHANDLED_REJECTION: ${msg}`);
		} catch (error) {
			console.error("Error logging unhandled rejection:", error);
		}
	});

	// uncaughtException
	process.on("uncaughtException", (error) => {
		try {
			const logger = getBaseLogger();
			const msg = (error?.message || "").toLowerCase();

			// Некоторые ошибки игнорируем (они не критичны)
			const ignorable = [
				"err_stream_premature_close",
				"write after end",
				"epipe",
			];

			if (ignorable.some((p) => msg.includes(p))) {
				logger.debug(`IGNORED_UNCAUGHT_EXCEPTION: ${error.message}`, {
					stack: error.stack,
				});
				return;
			}

			logger.error(`UNCAUGHT_EXCEPTION: ${error.message}`, {
				stack: error.stack,
			});
		} catch (logError) {
			console.error("Error logging uncaught exception:", logError);
			console.error("Original error:", error);
		}
	});
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Экспорт по умолчанию
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default createLogger();
