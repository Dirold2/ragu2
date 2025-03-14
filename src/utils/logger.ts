import { format } from "date-fns";
import { ru } from "date-fns/locale";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import chalk from "chalk";

/**
 * Creates and configures a winston logger instance
 * @param {string} [nameModule] - Optional module name to include in log messages
 * @returns {winston.Logger} Configured winston logger instance
 */
export const createLogger = (nameModule?: string): winston.Logger => {
	// Custom format for log messages including timestamp and module name
	const customFormat = winston.format.printf(
		({ level, message, timestamp, stack, url }) => {
			const formattedTime = format(
				new Date(timestamp as unknown as string),
				"dd.MM.yyyy HH:mm:ss",
				{ locale: ru },
			);
			let logMessage = `${formattedTime} ${nameModule ? ` | ${chalk.blue(nameModule.toUpperCase())}` : ""} | ${level}: ${message}`;
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

	// Create base logger with file transports
	const logger = winston.createLogger({
		level: process.env.LOG_LEVEL || "info",
		format: fileFormat,
		transports: [
			// Daily rotating transport for general application logs
			new DailyRotateFile({
				filename: "logs/application-%DATE%.log",
				datePattern: "YYYY-MM-DD",
				zippedArchive: true,
				maxSize: "20m",
				maxFiles: "14d",
			}),
			// Daily rotating transport for error logs
			new DailyRotateFile({
				filename: "logs/error-%DATE%.log",
				datePattern: "YYYY-MM-DD",
				zippedArchive: true,
				maxSize: "20m",
				maxFiles: "14d",
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
	process.on("unhandledRejection", (ex) => {
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
