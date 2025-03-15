import dotenv from "dotenv";
import { ModuleManager } from "./core/ModuleManager.js";
import logger from "./utils/logger.js";
import { ModuleState } from "./types/index.js";
import { clear } from "console";

// Загружаем переменные окружения
dotenv.config();

async function main() {
	try {
		// Очищаем консоль перед запуском
		clear();

		logger.info({
			message: "Starting Ragu2...",
			moduleState: ModuleState.INITIALIZING
		});

		// Создаем менеджер модулей
		const moduleManager = new ModuleManager();

		// Загружаем все модули автоматически
		await moduleManager.loadModules();

		// Инициализируем все модули (с учетом зависимостей)
		await moduleManager.initializeModules();

		// Запускаем все модули
		await moduleManager.startModules();

		logger.info({
			message: "ragu2 is ready!",
			moduleState: ModuleState.RUNNING
		});

		// Обработка завершения работы
		process.on("SIGTERM", async () => {
			logger.info({
				message: "Received SIGTERM signal. Starting graceful shutdown...",
				moduleState: ModuleState.STOPPING
			});
			await moduleManager.stopModules();
			logger.info({
				message: "Shutdown complete",
				moduleState: ModuleState.STOPPED
			});
			process.exit(0);
		});

		process.on("SIGINT", async () => {
			// logger.info({
			// 	message: "Received SIGINT signal. Starting graceful shutdown...",
			// 	moduleState: ModuleState.STOPPING
			// });
			await moduleManager.stopModules();
			logger.info({
				message: "Shutdown complete",
				moduleState: ModuleState.STOPPED
			});
			process.exit(0);
		});
	} catch (error) {
		logger.error({
			message: "Fatal error during application startup",
			moduleState: ModuleState.ERROR,
			error
		});
		process.exit(1);
	}
}

// Запускаем приложение
main().catch((error) => {
	logger.error({
		message: "Unhandled error in main",
		moduleState: ModuleState.ERROR,
		error
	});
	process.exit(1);
});
