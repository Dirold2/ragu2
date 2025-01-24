import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { bot } from "../bot.js";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const createLogger = () => {
	const customFormat = winston.format.printf(
		({ level, message, timestamp, stack }) => {
			const formattedTime = format(
				new Date(timestamp as unknown as string),
				"dd.MM.yyyy HH:mm:ss",
				{ locale: ru },
			);
			const logMessage = `${formattedTime} | ${level}: ${message}`;
			return stack ? `${logMessage}\n${stack}` : logMessage;
		},
	);

	const fileFormat = winston.format.combine(
		winston.format.timestamp(),
		winston.format.errors({ stack: true }),
		customFormat,
	);

	const consoleFormat = winston.format.combine(
		winston.format.colorize(),
		winston.format.timestamp(),
		customFormat,
	);

	const logger = winston.createLogger({
		level: process.env.LOG_LEVEL || "info",
		format: fileFormat,
		transports: [
			new DailyRotateFile({
				filename: "logs/application-%DATE%.log",
				datePattern: "YYYY-MM-DD",
				zippedArchive: true,
				maxSize: "20m",
				maxFiles: "14d",
			}),
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

	if (process.env.NODE_ENV !== "production") {
		logger.add(
			new winston.transports.Console({
				format: consoleFormat,
				handleExceptions: true,
				handleRejections: true,
			}),
		);
	}

	logger.exceptions.handle(
		new winston.transports.File({ filename: "logs/exceptions.log" }),
	);

	process.on("unhandledRejection", (ex) => {
		logger.error(
			`${bot.loggerMessages.ERROR_UNHANDLED_REJECTION}: ${ex instanceof Error ? ex.message : String(ex)}`,
		);
	});

	return logger;
};

const logger = createLogger();

export default logger;
