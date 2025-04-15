import chokidar from "chokidar";
import { dirname } from "dirname-filename-esm";
import { DIService, MetadataStorage } from "discordx";
import { config } from "dotenv";
import { resolve } from "@discordx/importer";
import { bot } from "./bot.js";
import { resolve as r } from "path";
import { createLogger, createLocale } from "./utils/index.js";
import translations from "./locales/en.json" with { type: "json" };

const __dirname = dirname(import.meta);

config({ path: r(dirname(import.meta), ".env") });

/** Timeout constants */
const CONSTANTS = {
	RELOAD_DEBOUNCE: 500,
	WRITE_STABILITY: 300,
	POLL_INTERVAL: 100,
	MEMORY_CHECK_INTERVAL: 5000, // Check memory every 5 seconds
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

const logger = createLogger(`ragu2`);
const locale = createLocale<typeof translations>(`ragu2`);
locale.load()

// Memory monitoring
let _maxMemoryConsumption = 0;
let _dtOfMaxMemoryConsumption = new Date();
let _memoryMonitorInterval: NodeJS.Timeout;
let _lastMemoryUsage = 0;
let memoryReadings: number[] = [];
const MAX_READINGS = 10;

function checkForMemoryLeaks(currentUsage: number) {
	memoryReadings.push(currentUsage);
	if (memoryReadings.length > MAX_READINGS) {
		memoryReadings.shift();
		
		// Check if memory consistently increases
		let consistentGrowth = true;
		for (let i = 1; i < memoryReadings.length; i++) {
			if (memoryReadings[i] <= memoryReadings[i-1]) {
				consistentGrowth = false;
				break;
			}
		}
		
		if (consistentGrowth) {
			logger.warn("Potential memory leak detected: Memory usage consistently increasing");
		}
	}
}
// Start memory monitoring
function startMemoryMonitoring() {
  // Initial check
  updateMemoryStats();

  // Set up periodic checks - every 2 seconds
  _memoryMonitorInterval = setInterval(() => {
    updateMemoryStats();
  }, 1000); // 2 seconds
}

// Update memory statistics
function updateMemoryStats() {
  const memUsage = process.memoryUsage();
  
  // Clear console
  console.clear();
  
  // Calculate difference from last check
  const diff = memUsage.rss - _lastMemoryUsage;
  const diffFormatted = diff > 0 ? `+${formatMemoryUsage(diff)}` : `-${formatMemoryUsage(Math.abs(diff))}`;
  
  checkForMemoryLeaks(memUsage.rss);

  // Update last memory usage
  _lastMemoryUsage = memUsage.rss;
  
  // Update max if needed
  if (memUsage.rss > _maxMemoryConsumption) {
    _maxMemoryConsumption = memUsage.rss;
    _dtOfMaxMemoryConsumption = new Date();
  }
  
  // Display current memory stats
  console.log(`=== Memory Usage Stats (${new Date().toISOString()}) ===`);
  console.log(`Current: ${formatMemoryUsage(memUsage.rss)} (${diffFormatted} since last check)`);
  console.log(`Max:     ${formatMemoryUsage(_maxMemoryConsumption)} (at ${_dtOfMaxMemoryConsumption.toISOString()})`);
  console.log(`Heap:    ${formatMemoryUsage(memUsage.heapUsed)}/${formatMemoryUsage(memUsage.heapTotal)}`);
  console.log(`External: ${formatMemoryUsage(memUsage.external)}`);
  console.log('================================================');
  
  // Also log to file via logger
  logger.debug(`Memory usage: ${formatMemoryUsage(memUsage.rss)}, Change: ${diffFormatted}`);
}

// Format memory usage to human-readable format
function formatMemoryUsage(bytes: number): string {
	if (bytes < 1024) return bytes + ' B';
	const units = ['KiB', 'MiB', 'GiB', 'TiB'];
	let size = bytes / 1024;
	let unitIndex = 0;
	
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	
	return size.toFixed(2) + ' ' + units[unitIndex];
}

// Start monitoring
startMemoryMonitoring();

// Register exit handler
process.on('exit', () => {
	// Clear interval to prevent memory leaks
	if (_memoryMonitorInterval) {
		clearInterval(_memoryMonitorInterval);
	}
	
	// Log maximum memory consumption
	console.log(`Max memory consumption: ${formatMemoryUsage(_maxMemoryConsumption)} at ${_dtOfMaxMemoryConsumption.toISOString()}`);
});

// Also handle other termination signals
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(signal => {
	process.on(signal, () => {
		console.log(`\nReceived ${signal}...`);
		console.log(`Max memory consumption: ${formatMemoryUsage(_maxMemoryConsumption)} at ${_dtOfMaxMemoryConsumption.toISOString()}`);
		process.exit(0);
	});
});

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
		await bot.initialize();

		logger.info(locale.t("messages.bot.initialization.success"));

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

		logger.info(locale.t("messages.bot.start.success"));

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