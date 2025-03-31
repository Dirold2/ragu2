import { ModuleManager } from "./core/ModuleManager.js";
import { createLogger } from "./utils/logger.js";
import path from "path";
import { dirname } from "dirname-filename-esm";
import { ModuleState } from "./types/index.js";
import { enableModuleLeakDetection } from "./utils/module-leak-detector.js";

const __dirname = dirname(import.meta);
const logger = createLogger("App");

/**
 * Main application entry point
 * Initializes and manages the application lifecycle
 */
async function main() {
	try {
		logger.info({
			message: "Starting application...",
			moduleState: ModuleState.STARTING,
		});

		// Включаем обнаружение утечек памяти для всех модулей
		if (process.env.ENABLE_LEAK_DETECTION === "true") {
			enableModuleLeakDetection();
			logger.info("Memory leak detection enabled for all modules");
		}

		// Create module manager with configuration
		const moduleManager = new ModuleManager({
			modulesPath: path.resolve(__dirname, "./modules"),
			configPath: path.resolve(__dirname, "./config"),
		});

		// Set up comprehensive error handling
		moduleManager.on("error", (error, moduleName, operation) => {
			logger.error(
				`Module error in ${moduleName || "unknown"} during ${operation || "unknown operation"}:`,
				error instanceof Error ? error : new Error(String(error)),
			);
		});

		// Подписываемся на события обнаружения утечек памяти
		moduleManager.on("memoryLeaks", (leaks) => {
			logger.warn({
				message: `Memory leak detection: Found ${leaks.length} potential memory leaks`,
				moduleState: ModuleState.WARNING,
			});

			leaks.forEach((leak: any) => {
				logger.warn({
					message: `Memory leak in module ${leak.moduleName}: ${leak.growthRate.toFixed(2)} MB/hour (${leak.severity} severity)`,
					recommendation: leak.recommendation,
					moduleState: ModuleState.WARNING,
				});
			});
		});

		// Set up ready event with detailed status reporting
		moduleManager.on("ready", (moduleStatus) => {
			const runningModules = moduleStatus.filter(
				(m: { state: ModuleState }) => m.state === ModuleState.RUNNING,
			).length;
			const totalModules = moduleStatus.length;

			logger.info({
				message: `Application ready! ${runningModules}/${totalModules} modules running`,
				moduleState: ModuleState.RUNNING,
			});

			// Log any modules with errors with structured data
			const modulesWithErrors = moduleStatus.filter(
				(m: { hasError: Error }) => m.hasError,
			);
			if (modulesWithErrors.length > 0) {
				logger.error({
					message: `${modulesWithErrors.length} modules have errors:`,
					modules: modulesWithErrors.map((m: { name: unknown }) => m.name),
					moduleState: ModuleState.ERROR,
				});

				modulesWithErrors.forEach(
					(m: { name: unknown; state: unknown; hasError: Error }) => {
						logger.error({
							message: `- ${m.name} (${m.state})`,
							error:
								m.hasError instanceof Error
									? {
											message: m.hasError.message,
											stack: m.hasError.stack,
											name: m.hasError.name,
										}
									: String(m.hasError),
							moduleState: ModuleState.ERROR,
						});
					},
				);
			}

			// Запускаем первоначальный анализ памяти через 5 минут после запуска
			if (process.env.ENABLE_MEMORY_ANALYSIS === "true") {
				setTimeout(
					async () => {
						try {
							logger.info("Running initial memory analysis...");
							const analysis = await moduleManager.analyzeMemory();

							if (analysis.leaks.length > 0) {
								logger.warn({
									message: `Initial memory analysis found ${analysis.leaks.length} potential memory leaks`,
									moduleState: ModuleState.WARNING,
								});
							} else {
								logger.info(
									"Initial memory analysis completed. No memory leaks detected.",
								);
							}
						} catch (error) {
							logger.error("Error during memory analysis:", error);
						}
					},
					5 * 60 * 1000,
				); // 5 минут
			}
		});

		// Application lifecycle management
		await moduleManager.loadModules();
		await moduleManager.initializeModules();

		// Performance monitoring
		const slowestModules = moduleManager.getSlowestModules();
		if (slowestModules.length > 0) {
			logger.debug({
				message: "Slowest modules during initialization:",
				modules: slowestModules.map((m) => m.name),
				moduleState: ModuleState.DEBUG,
			});

			slowestModules.slice(0, 3).forEach((m) => {
				const avgTime =
					m.operations.initialize.totalDuration / m.operations.initialize.count;
				logger.debug({
					message: `- ${m.name}: ${avgTime.toFixed(2)}ms`,
					moduleState: ModuleState.DEBUG,
				});
			});
		}

		// Настраиваем периодический анализ памяти (каждые 6 часов)
		if (process.env.ENABLE_PERIODIC_MEMORY_ANALYSIS === "true") {
			const memoryAnalysisInterval = setInterval(
				async () => {
					try {
						logger.info("Running periodic memory analysis...");
						const analysis = await moduleManager.analyzeMemory();

						if (analysis.leaks.length > 0) {
							logger.warn({
								message: `Periodic memory analysis found ${analysis.leaks.length} potential memory leaks`,
								moduleState: ModuleState.WARNING,
							});
						} else {
							logger.info(
								"Periodic memory analysis completed. No memory leaks detected.",
							);
						}
					} catch (error) {
						logger.error("Error during periodic memory analysis:", error);
					}
				},
				6 * 60 * 60 * 1000,
			); // 6 часов

			// Убедимся, что интервал не мешает процессу завершиться
			memoryAnalysisInterval.unref();
		}

		// Graceful shutdown handlers
		const shutdownHandler = async (signal: string) => {
			logger.info(`Received ${signal} signal, shutting down gracefully...`);
			try {
				// Проверяем утечки памяти перед завершением работы
				if (process.env.CHECK_LEAKS_ON_SHUTDOWN === "true" && global.gc) {
					const { ModuleLeakDetector } = await import(
						"./utils/module-leak-detector.js"
					);
					logger.info("Checking for memory leaks before shutdown...");
					const leakedModules = await ModuleLeakDetector.checkForLeaks();

					if (leakedModules.length > 0) {
						logger.warn({
							message: `Detected ${leakedModules.length} modules with potential memory leaks: ${leakedModules.join(", ")}`,
							moduleState: ModuleState.WARNING,
						});
					}
				}

				await moduleManager.stopModules();

				logger.info("All modules stopped successfully");
				process.exit(0);
			} catch (error) {
				logger.error(`Error during shutdown: ${error}`);
				process.exit(1);
			}
		};

		process.on("SIGINT", () => shutdownHandler("SIGINT"));
		process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

		// Global error handlers
		process.on("uncaughtException", (error) => {
			logger.error("Uncaught exception:", error);
		});

		process.on("unhandledRejection", (reason) => {
			logger.error(
				"Unhandled rejection:",
				reason instanceof Error ? reason : new Error(String(reason)),
			);
		});
	} catch (error) {
		logger.error(
			"Fatal error during application startup:",
			error instanceof Error ? error : new Error(String(error)),
		);
		process.exit(1);
	}
}

// Start the application
main().catch((error) => {
	console.error("Unhandled error in main function:", error);
	process.exit(1);
});
