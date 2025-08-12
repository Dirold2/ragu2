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

config({ path: resolve(dirname(import.meta), "../../.env") });

dayjs.locale(process.env.LOG_LANG?.trim() || "en");

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
	state?: string;
	source?: string;
}

type ExtendedLogInfo = winston.Logform.TransformableInfo & LogMeta;

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

const colorizeLevel = (level: string): string => {
	const open = LEVEL_COLOR_OPEN[level] ?? "";
	const close = LEVEL_COLOR_CLOSE[level] ?? "";
	return `${open}${level}${close}`;
};

const logDir = path.join(process.cwd(), "logs");
const logConfig = {
	maxSize: "20m",
	maxFiles: "14d",
	zippedArchive: true,
	tailable: true,
	compress: true,
	datePattern: "YYYY-MM-DD",
};

const SHOW_SOURCE = (() => {
	const raw = process.env.LOG_SHOW_SOURCE?.trim();
	if (!raw) return true;
	const lowered = raw.toLowerCase();
	return !(lowered === "0" || lowered === "false" || lowered === "off");
})();

async function ensureLogDirExists(): Promise<void> {
	try {
		await fs.access(logDir);
	} catch {
		await fs.mkdir(logDir, { recursive: true });
	}
}

await ensureLogDirExists();

const CALLER_SKIP_PATTERNS = [
	"node:internal",
	"node:events",
	"(internal/)",
	"/internal/",
	"winston",
	"/utils/logger",
	"\\utils\\logger",
	"/node_modules/",
	"\\node_modules\\",
	"@discordx/importer",
	"importx",
	"discordx",
	"ts-node",
	"loader.js",
	"combine.js",
];

const addCallerInfo = winston.format((info: ExtendedLogInfo) => {
	try {
		const level = String(info.level || "").toLowerCase();
		if (level !== "warn" && level !== "error") return info;
		const frames = callsites();
		for (const frame of frames) {
			const filePath = frame.getFileName?.();
			if (!filePath) continue;
			const lower = filePath.toLowerCase();
			if (lower.startsWith("node:")) continue;
			if (CALLER_SKIP_PATTERNS.some((p) => lower.includes(p))) continue;
			const inSrc = lower.includes("/src/") || lower.includes("\\src\\");
			const file = path.basename(filePath);
			const line = frame.getLineNumber?.();
			if (inSrc) {
				info.source = line ? `${file}:${line}` : file;
				break;
			}
		}
		if (!info.source) {
			const frames2 = callsites();
			for (const frame of frames2) {
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
		// ignore
	}
	return info;
});

const createFormatter = (opts: { colorizeLevelName: boolean }) =>
	winston.format.printf((info: ExtendedLogInfo) => {
		const timestamp = info.timestamp as string;
		const levelStr = opts.colorizeLevelName
			? colorizeLevel(info.level)
			: info.level;

		let modulePart = "";
		if (info.module) modulePart += `| [${info.module}]`;
		if (info.state) modulePart += ` (${info.state})`;

		let out = `${timestamp} ${modulePart} | ${levelStr}: ${info.message}`;

		if (info.url) out += ` url=${info.url}`;
		if (info.stack) out += `\n${info.stack}`;
		if (SHOW_SOURCE && info.source) out += ` | ${info.source}`;
		return out;
	});

const baseLogger = winston.createLogger({
	level: process.env.LOG_LEVEL || "info",
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

if (process.env.NODE_ENV !== "production") {
	baseLogger.add(
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

baseLogger.playerError = function (error: unknown, url?: string) {
	const message = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : undefined;
	const truncatedStack =
		stack && stack.length > 3000
			? stack.slice(0, 3000) + "...[truncated]"
			: stack;
	this.error(message, {
		url,
		stack: truncatedStack,
	});
};

let handlersRegistered = false;

const registerErrorHandlers = (): void => {
	if (handlersRegistered) return;

	const gracefulShutdown = async (signal: string) => {
		try {
			baseLogger.info(`Logger shutting down (${signal})...`);

			await new Promise<void>((resolve) => {
				baseLogger.on("finish", () => resolve());
				baseLogger.end();
			});

			process.exit(0);
		} catch (error) {
			console.error("Error during logger shutdown:", error);
			process.exit(1);
		}
	};

	["SIGINT", "SIGTERM"].forEach((signal) => {
		process.once(signal, () => gracefulShutdown(signal));
	});

	process.on("beforeExit", () => {
		baseLogger.info("Logger shutting down (beforeExit)...");
	});

	process.on("unhandledRejection", (reason) => {
		try {
			const msg =
				reason instanceof Error
					? reason.stack || reason.message
					: String(reason);
			baseLogger.error(`UNHANDLED_REJECTION (fallback): ${msg}`);
		} catch (error) {
			console.error("Error logging unhandled rejection:", error);
		}
	});

	process.on("uncaughtException", (error) => {
		try {
			const msg = (error?.message || "").toLowerCase();
			const ignorable = [
				"premature close",
				"err_stream_premature_close",
				"write after end",
				"epipe",
			];
			if (ignorable.some((p) => msg.includes(p))) {
				baseLogger.debug(`IGNORED_UNCAUGHT_EXCEPTION: ${error.message}`, {
					stack: error.stack,
				});
				return;
			}
			baseLogger.error(`UNCAUGHT_EXCEPTION: ${error.message}`, {
				stack: error.stack,
			});
		} catch (logError) {
			console.error("Error logging uncaught exception:", logError);
			console.error("Original error:", error);
		}
	});

	handlersRegistered = true;
};

registerErrorHandlers();

const loggerCache = new LRUCache<string, winston.Logger>({
	max: 100,
});

/**
 * @en Creates or returns a child logger with module/state metadata
 * @ru Создает или возвращает дочерний логгер с метаданными модуля/состояния
 * @param nameModule - Module name for logging context
 * @param moduleState - Module state for logging context
 * @returns Child logger instance
 */
export function createLogger(
	nameModule?: string,
	moduleState?: ModuleState,
): winston.Logger {
	const key = `${nameModule ?? "default"}:${moduleState ?? ""}`;
	const cached = loggerCache.get(key);
	if (cached) return cached as winston.Logger;

	const childLogger = baseLogger.child({
		module: nameModule || "",
		state: moduleState || "",
	});

	childLogger.playerError = function (error: unknown, url?: string) {
		const message = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? error.stack : undefined;
		const truncatedStack =
			stack && stack.length > 3000 ? stack.slice(0, 3000) + "..." : stack;
		this.error(message, { url, stack: truncatedStack });
	};

	loggerCache.set(key, childLogger);
	return childLogger;
}

/**
 * @en Removes old log files (files only, not directories)
 * @ru Удаляет старые файлы логов (только файлы, не директории)
 * @param daysToKeep - Number of days to keep logs
 */
export const cleanupOldLogs = async (daysToKeep = 14): Promise<void> => {
	const entries = await fs.readdir(logDir);
	const now = Date.now();
	const maxAge = daysToKeep * 86400000;

	await Promise.all(
		entries.map(async (name) => {
			const filePath = path.join(logDir, name);
			try {
				const stat = await fs.stat(filePath);
				if (!stat.isFile()) return;
				if (now - stat.mtime.getTime() > maxAge) {
					await fs.unlink(filePath);
				}
			} catch (err) {
				baseLogger.warn(`Failed to cleanup ${name}: ${String(err)}`);
			}
		}),
	);
};

export default createLogger();
