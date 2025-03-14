import dotenv from "dotenv";
import { ModuleManager } from "./core/ModuleManager.js";
import logger from "./utils/logger.js";

// Загружаем переменные окружения
dotenv.config();

async function main() {
	try {
		// Создаем менеджер модулей
		const moduleManager = new ModuleManager();

		// Загружаем все модули автоматически
		await moduleManager.loadModules();

		// Инициализируем все модули (с учетом зависимостей)
		await moduleManager.initializeModules();

		// Запускаем все модули
		await moduleManager.startModules();

		// Обработка завершения работы
		process.on("SIGTERM", async () => {
			logger.info("Received SIGTERM signal. Starting graceful shutdown...");
			await moduleManager.stopModules();
			process.exit(0);
		});

		process.on("SIGINT", async () => {
			logger.info("Received SIGINT signal. Starting graceful shutdown...");
			await moduleManager.stopModules();
			process.exit(0);
		});
	} catch (error) {
		logger.error("Fatal error during application startup:", error);
		process.exit(1);
	}
}

// Запускаем приложение
main().catch((error) => {
	logger.error("Unhandled error in main:", error);
	process.exit(1);
});
