import { format } from "date-fns";
import { ru } from "date-fns/locale";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import chalk from "chalk";
import { ModuleState } from "../types/index.js";
import path from "path";
import fs from "fs/promises";

// Увеличиваем лимит слушателей для process
process.setMaxListeners(33);

const getStateColor = (state?: ModuleState): ((text: string) => string) => {
	if (!state) return chalk.blue;

	switch (state) {
		case ModuleState.UNINITIALIZED:
			return chalk.dim;
		case ModuleState.INITIALIZING:
			return chalk.hex("#6495ED");
		case ModuleState.INITIALIZED:
			return chalk.hex("#00CED1");
		case ModuleState.STARTING:
			return chalk.hex("#32CD12");
		case ModuleState.RUNNING:
			return chalk.hex("#32CD32");
		case ModuleState.STOPPING:
			return chalk.hex("#FFA500");
		case ModuleState.STOPPED:
			return chalk.hex("#A9A9A9");
		case ModuleState.ERROR:
			return chalk.hex("#FF4500");
		case ModuleState.WARNING:
			return chalk.hex("#FFA500");
		case ModuleState.DEBUG:
			return chalk.hex("#0000FF");
		default:
			return chalk.blue;
	}
};

/**
 * Creates and configures a winston logger instance
 * @param {string} [nameModule] - Optional module name to include in log messages
 * @returns {winston.Logger} Configured winston logger instance
 */
export const createLogger = (nameModule?: string): winston.Logger => {
	// Custom format for log messages including timestamp and module name
	const customFormat = winston.format.printf(
		({ level, message, timestamp, stack, url, moduleState }) => {
			const formattedTime = format(
				new Date(timestamp as unknown as string),
				"dd.MM.yyyy HH:mm:ss",
				{ locale: ru },
			);

			const colorize = getStateColor(moduleState as ModuleState | undefined);
			const moduleName = nameModule
				? ` | ${colorize(nameModule.toUpperCase())}`
				: "";

			let logMessage = `${formattedTime}${moduleName} | ${level}: ${message}`;
			if (url) {
				logMessage += `\nAt: ${url}`;
			}
			return stack ? `${logMessage}\n${stack}` : logMessage;
		},
	);

	// Format configuration for file logging
	const fileFormat = winston.format.combine(
		winston.format.timestamp(),
		winston.format.errors({ stack: true }),
		customFormat,
	);

	// Format configuration for console logging with colors
	const consoleFormat = winston.format.combine(
		winston.format.colorize(),
		winston.format.timestamp(),
		customFormat,
	);

	const logConfig = {
		maxSize: "20m",
		maxFiles: "14d",
		zippedArchive: true,
		tailable: true, // Автоматически удаляет старые логи
		compress: true, // Сжимает архивные файлы
	};

	// Create base logger with file transports
	const logger = winston.createLogger({
		level: process.env.LOG_LEVEL || "info",
		format: fileFormat,
		transports: [
			// Daily rotating transport for general application logs
			new DailyRotateFile({
				...logConfig,
				filename: "logs/application-%DATE%.log",
				datePattern: "YYYY-MM-DD",
			}),
			// Daily rotating transport for error logs
			new DailyRotateFile({
				...logConfig,
				filename: "logs/error-%DATE%.log",
				datePattern: "YYYY-MM-DD",
				level: "error",
			}),
		],
	});

	// Add console transport in non-production environments
	if (process.env.NODE_ENV !== "production") {
		logger.add(
			new winston.transports.Console({
				format: consoleFormat,
				handleExceptions: true,
				handleRejections: true,
			}),
		);
	}

	// Configure exception handling
	logger.exceptions.handle(
		new winston.transports.File({ filename: "logs/exceptions.log" }),
	);

	// Handle unhandled promise rejections
	process.on("unhandledRejection", (ex: unknown) => {
		logger.error(
			`ERROR_UNHANDLED_REJECTION: ${ex instanceof Error ? ex.message : String(ex)}`,
		);
	});

	// Custom format for player messages
	const playerFormat = winston.format((info) => {
		if (info.url) {
			info.message = `${info.message} (URL: ${info.url})`;
		}
		return info;
	});

	// Add player-specific transport with custom format
	logger.add(
		new winston.transports.File({
			filename: "logs/player-error.log",
			level: "error",
			format: winston.format.combine(playerFormat(), fileFormat),
		}),
	);

	// Добавляем обработчик ошибок для транспортов
	logger.transports.forEach((transport) => {
		transport.on("error", (error) => {
			console.error("Logger transport error:", error);
		});
	});

	// Добавляем очистку обработчиков при завершении работы
	process.once("beforeExit", () => {
		logger.close();
		logger.clear(); // Очищаем все обработчики
	});

	return logger;
};

/**
 * Extend winston Logger interface with custom methods
 */
declare module "winston" {
	interface Logger {
		/**
		 * Log player-specific errors
		 * @param {unknown} error - Error to log
		 * @param {string} [url] - Optional URL where error occurred
		 */
		playerError(error: unknown, url?: string): void;
	}
}

// Export default logger instance
const logger = createLogger();

export default logger;

// Добавляем функцию очистки старых логов
export const cleanupOldLogs = async (daysToKeep = 14): Promise<void> => {
	const logsDir = path.join(process.cwd(), "logs");
	const files = await fs.readdir(logsDir);
	const now = Date.now();
	const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

	for (const file of files) {
		const filePath = path.join(logsDir, file);
		const stats = await fs.stat(filePath);
		if (now - stats.mtime.getTime() > maxAge) {
			await fs.unlink(filePath);
		}
	}
};
