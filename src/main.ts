import { ModuleManager } from "./core/ModuleManager.js";
import { createLogger } from "./utils/logger.js";
import path from "path";
import { dirname } from "dirname-filename-esm";
import { ModuleState } from "./types/index.js";
import { clear } from "console";

const __dirname = dirname(import.meta);
const logger = createLogger("App");

async function main() {
	try {
		logger.info("Starting application...");

		// Create module manager
		const moduleManager = new ModuleManager({
			modulesPath: path.resolve(__dirname, "./modules"),
			configPath: path.resolve(__dirname, "./config"),
		});

		// Set up error handling
		moduleManager.on("error", (error, moduleName, operation) => {
			logger.error(
				`Module error in ${moduleName || "unknown"} during ${operation || "unknown operation"}:`,
				error,
			);
		});

		// Set up ready event
		moduleManager.on("ready", (moduleStatus) => {
			const runningModules = moduleStatus.filter(
				(m: { state: string }) => m.state === "RUNNING",
			).length;
			const totalModules = moduleStatus.length;

			logger.info(
				`Application ready! ${runningModules}/${totalModules} modules running`,
			);

			clear()

			// Log any modules with errors
			const modulesWithErrors = moduleStatus.filter(
				(m: { hasError: boolean }) => m.hasError,
			);
			if (modulesWithErrors.length > 0) {
				logger.warn({
					message: `${modulesWithErrors.length} modules have errors:`,
					modules: modulesWithErrors,
					moduleState: ModuleState.WARNING,
				});
				modulesWithErrors.forEach((m: { name: string; state: string }) => {
					logger.warn({
						message: `- ${m.name} (${m.state})`,
						moduleState: ModuleState.WARNING,
					});
				});
			}
		});

		// Load, initialize and start modules
		await moduleManager.loadModules();
		await moduleManager.initializeModules();
		await moduleManager.startModules();

		// Log performance metrics
		const slowestModules = moduleManager.getSlowestModules();
		if (slowestModules.length > 0) {
			logger.debug({
				message: "Slowest modules during initialization:",
				modules: slowestModules,
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

		// Handle process termination
		process.on("SIGINT", async () => {
			logger.info("Received SIGINT signal, shutting down...");
			await moduleManager.stopModules();
			process.exit(0);
		});

		process.on("SIGTERM", async () => {
			logger.info("Received SIGTERM signal, shutting down...");
			await moduleManager.stopModules();
			process.exit(0);
		});

		process.on("uncaughtException", (error) => {
			logger.error("Uncaught exception:", error);
		});

		process.on("unhandledRejection", (reason) => {
			logger.error("Unhandled rejection:", reason);
		});
	} catch (error) {
		logger.error("Failed to start application:", error);
		process.exit(1);
	}
}

// Start the application
main();
