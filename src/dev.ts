import chokidar from "chokidar";
import { dirname } from "dirname-filename-esm";
import { DIService, MetadataStorage } from "discordx";
import { config } from "dotenv";
import { resolve } from "@discordx/importer";
import { bot } from "./bot.js";
import { resolve as r } from "path";

const __dirname = dirname(import.meta);

config({ path: r(dirname(import.meta), ".env") });

/** Timeout constants */
const CONSTANTS = {
	RELOAD_DEBOUNCE: 500,
	WRITE_STABILITY: 300,
	POLL_INTERVAL: 100,
} as const;

/** File patterns for different components */
const patterns = {
	commands: `${__dirname}/commands/**/*.ts`,
	events: `${__dirname}/events/**/*.ts`,
	services: `${__dirname}/services/**/*.ts`,
	plugins: `${__dirname}/plugins/**/*.ts`,
} as const;

/**
 * Clears Node.js require cache for project files
 */
const clearNodeCache = (): void => {
	Object.keys(require.cache)
		.filter((key) => key.includes(__dirname))
		.forEach((key) => delete require.cache[key]);
};

/**
 * Loads and imports files from specified source
 * @param src - Source path pattern to load files from
 */
async function loadFiles(src: string): Promise<void> {
	try {
		// Clear existing command metadata before loading
		if (src === patterns.commands) {
			MetadataStorage.clear();
		}

		const files = await resolve(src);
		await Promise.all(
			files.map((file) =>
				import(file).catch((error) =>
					bot.logger.error(
						// `${bot.loggerMessages.DEV_FAILDE_TO_IMPORT_FILE(file)}`,
						error,
					),
				),
			),
		);
	} catch (error) {
		bot.logger.error(
			// `${bot.loggerMessages.DEV_FAILDE_TO_LOAD_FILE_FROM(src)}`,
			error,
		);
	}
}

/**
 * Reloads all components
 */
async function reload(): Promise<void> {
	try {
		clearNodeCache();
		DIService.engine.clearAllServices();

		await Promise.all([
			loadFiles(patterns.commands),
			loadFiles(patterns.events),
			loadFiles(patterns.services),
			loadFiles(patterns.plugins),
		]);

		bot.removeEvents();
		bot.initEvents();

		// bot.logger.info();
	} catch (error) {
		bot.logger.error(error);
	}
}

/**
 * Main run function
 */
async function run(): Promise<void> {
	try {
		await bot.initialize()

		await Promise.all([
			loadFiles(patterns.commands),
			loadFiles(patterns.events),
			loadFiles(patterns.services),
			loadFiles(patterns.plugins),
		]);

		const token = process.env.DISCORD_TOKEN;
		if (!token) {
			throw new Error(`token error`);
		}

		await bot.start(token);

		if (process.env.NODE_ENV === "development") {
			const debouncedReload = () => {
				let timeoutId: NodeJS.Timeout;
				return () => {
					clearTimeout(timeoutId);
					timeoutId = setTimeout(reload, CONSTANTS.RELOAD_DEBOUNCE);
				};
			};

			const watcher = chokidar.watch(__dirname, {
				ignored: ["**/node_modules/**", "**/.git/**"],
				persistent: true,
				ignoreInitial: true,
			});

			watcher
				.on("add", debouncedReload())
				.on("change", debouncedReload())
				.on("unlink", debouncedReload());
		}
	} catch (error) {
		bot.logger.error(error);
		process.exit(1);
	}
}

run();