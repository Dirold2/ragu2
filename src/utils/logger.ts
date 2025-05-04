import dayjs from "dayjs";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path, { resolve } from "path";
import fs from "fs/promises";
import { LRUCache } from "lru-cache";
import styles from "ansi-styles";
import { dirname } from "dirname-filename-esm/index.js";
import { config } from "dotenv";

// Load environment variables from .env file
config({ path: resolve(dirname(import.meta), "../.env") });

// Set the locale for dayjs from environment variable LOG_LANG or default to English
dayjs.locale(`${process.env.LOG_LANG}` || "en");

/**
 * @en Enumeration of module states used for logging and state management.
 * @ru Перечисление состояний модуля, используемое для логирования и управления состоянием.
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
 * @en Returns the level name with ANSI color codes based on the level.
 * @ru Возвращает имя уровня логирования с ANSI-кодами цвета в зависимости от уровня.
 *
 * @param level - Log level (e.g., "info", "warn", "error").
 * @returns Colored string for the level.
 */
const colorizeLevel = (level: string): string => {
	switch (level) {
		case "error":
			return `${styles.red.open}${level}${styles.red.close}`;
		case "warn":
			return `${styles.yellow.open}${level}${styles.yellow.close}`;
		case "info":
			return `${styles.blue.open}${level}${styles.blue.close}`;
		case "debug":
			return `${styles.green.open}${level}${styles.green.close}`;
		default:
			return level;
	}
};

/**
 * @en Extended logger type supporting an additional playerError method.
 * @ru Расширенный тип логгера с дополнительным методом playerError.
 */
type ExtendedLogger = winston.Logger & {
	playerError: (error: unknown, url?: string) => void;
};

/**
 * @en Directory where log files are stored.
 * @ru Директория, в которой хранятся файлы логов.
 */
const logDir = path.join(process.cwd(), "logs");

/**
 * @en Configuration object for log rotation and file settings.
 * @ru Объект конфигурации для ротации логов и настроек файлов.
 */
const logConfig = {
	maxSize: "20m",
	maxFiles: "14d",
	zippedArchive: true,
	tailable: true,
	compress: true,
	datePattern: "YYYY-MM-DD",
};

/**
 * @en Formatter for file transports with colors applied.
 * @ru Форматтер для файловых транспортов с применением цветов.
 */
const formatter = winston.format.printf(({ level, message, stack, url }) => {
	const time = dayjs().format("DD.MM.YYYY HH:mm:ss");
	let msg = `${time} | ${colorizeLevel(level)}: ${message}`;
	if (url) msg += `\nAt: ${url}`;
	return stack ? `${msg}\n${stack}` : msg;
});

/**
 * @en Formatter for console transport without colorization.
 * @ru Форматтер для консольного транспорта без цветового оформления.
 */
const formatterConsole = winston.format.printf(
	({ level, message, stack, url }) => {
		const time = dayjs().format("DD.MM.YYYY HH:mm:ss");
		let msg = `${time} | ${level}: ${message}`;
		if (url) msg += `\nAt: ${url}`;
		return stack ? `${msg}\n${stack}` : msg;
	},
);

/**
 * @en Ensures that the log directory exists; creates it if it doesn't.
 * @ru Гарантирует существование директории логов; создает её, если она не существует.
 *
 * @returns A Promise resolved when the directory exists.
 */
async function ensureLogDirExists(): Promise<void> {
	try {
		await fs.access(logDir);
	} catch {
		await fs.mkdir(logDir, { recursive: true });
	}
}

/**
 * @en Base logger singleton instance with file transports.
 * @ru Базовый экземпляр логгера (singleton) с файловыми транспортами.
 */
const baseLogger = winston.createLogger({
	level: process.env.LOG_LEVEL || "info",
	format: formatterConsole,
	transports: [
		new DailyRotateFile({
			...logConfig,
			filename: `${logDir}/application-%DATE%.log`,
		}),
		new DailyRotateFile({
			...logConfig,
			filename: `${logDir}/error-%DATE%.log`,
			level: "error",
		}),
		new winston.transports.File({
			filename: `${logDir}/player-error.log`,
			level: "error",
		}),
	],
	exitOnError: false,
}) as ExtendedLogger;

// Add console transport with colorized formatter for non-production environments
if (process.env.NODE_ENV !== "production") {
	baseLogger.add(
		new winston.transports.Console({
			handleExceptions: true,
			handleRejections: true,
			format: formatter,
		}),
	);
}

/**
 * @en Logs an error specifically for the player, including URL and stack trace if available.
 * @ru Логирует ошибку плеера, включая URL и стек вызовов, если они доступны.
 *
 * @param error - The error object or message.
 * @param url - Optional URL related to the error.
 */
baseLogger.playerError = function (error: unknown, url?: string) {
	this.error(error instanceof Error ? error.message : String(error), {
		url,
		stack: error instanceof Error ? error.stack : undefined,
	});
};

let handlersRegistered = false;

/**
 * @en Registers global error handlers and process signal handlers.
 * @ru Регистрирует глобальные обработчики ошибок и обработчики сигналов процесса.
 */
const registerErrorHandlers = (): void => {
	if (handlersRegistered) return;

	baseLogger.exceptions.handle(
		new winston.transports.File({ filename: `${logDir}/exceptions.log` }),
	);

	["SIGINT", "SIGTERM", "beforeExit"].forEach((signal) => {
		process.once(signal, () =>
			baseLogger.info(`Logger shutting down (${signal})...`),
		);
	});

	process.on("unhandledRejection", (reason) => {
		baseLogger.error(
			`UNHANDLED_REJECTION: ${
				reason instanceof Error
					? reason.stack || reason.message
					: String(reason)
			}`,
		);
	});

	handlersRegistered = true;
};

registerErrorHandlers();

/**
 * @en LRU cache for storing created child loggers.
 * @ru LRU-кэш для хранения созданных дочерних логгеров.
 */
const loggerCache = new LRUCache<string, ExtendedLogger>({
	max: 100,
	ttl: 1000 * 60 * 60,
});

/**
 * @en Creates a child logger with module-specific formatting and caching.
 * @ru Создает дочерний логгер с форматом, зависящим от модуля, и кэшированием.
 *
 * @param nameModule - The module name to be included in log messages.
 * @param moduleState - The current state of the module.
 * @returns The extended logger instance with module-specific formatting.
 */
export function createLogger(
	nameModule?: string,
	moduleState?: ModuleState,
): ExtendedLogger {
	const key = `${nameModule ?? "default"}:${moduleState ?? ""}`;
	const cached = loggerCache.get(key);
	if (cached) return cached;

	const combinedFormat = winston.format.combine(
		winston.format.timestamp(),
		winston.format.errors({ stack: true }),
		formatter,
	);

	// Pass the module name as an additional property
	const childLogger = baseLogger.child({
		module: nameModule || "",
	}) as ExtendedLogger;
	childLogger.format = combinedFormat;

	childLogger.playerError = function (error: unknown, url?: string) {
		this.error(error instanceof Error ? error.message : String(error), {
			url,
			stack: error instanceof Error ? error.stack : undefined,
		});
	};

	loggerCache.set(key, childLogger);
	return childLogger;
}

/**
 * @en Cleans up log files older than the specified number of days.
 * @ru Очищает файлы логов, которым старше указанного количества дней.
 *
 * @param daysToKeep - The number of days to keep logs (default: 14).
 * @returns A Promise resolved when old log files are deleted.
 */
export const cleanupOldLogs = async (daysToKeep = 14): Promise<void> => {
	const files = await fs.readdir(logDir);
	const now = Date.now();
	const maxAge = daysToKeep * 86400000;

	await Promise.all(
		files.map(async (file) => {
			const filePath = path.join(logDir, file);
			const { mtime } = await fs.stat(filePath);
			if (now - mtime.getTime() > maxAge) {
				await fs.unlink(filePath);
			}
		}),
	);
};

await ensureLogDirExists();

export default createLogger();
