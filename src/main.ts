import dotenv from "dotenv";
import { ModuleManager } from "./core/ModuleManager.js";
import logger from "./utils/logger.js";
import { ModuleState } from "./types/index.js";
import { clear } from "console";
import { cleanupOldLogs } from "./utils/logger.js";

// Загружаем переменные окружения
dotenv.config();

async function main() {
	try {
		// Обработка необработанных исключений
		process.on('uncaughtException', (error) => {
			logger.error({
				message: 'Uncaught Exception',
				moduleState: ModuleState.ERROR,
				error: error.stack
			});
		});

		// Обработка необработанных промисов
		process.on('unhandledRejection', (reason) => {
			logger.error({
				message: 'Unhandled Rejection',
				moduleState: ModuleState.ERROR,
				error: reason
			});
		});

		// Мониторинг использования памяти
		const memoryMonitor = setInterval(() => {
			const used = process.memoryUsage();
			logger.debug({
				message: 'Memory usage',
				moduleState: ModuleState.RUNNING,
				heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
				heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`
			});
		}, 300000); // каждые 5 минут

		// Очищаем консоль перед запуском
		clear();

		logger.info({
			message: "Starting Ragu2...",
			moduleState: ModuleState.INITIALIZING,
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
			moduleState: ModuleState.RUNNING,
		});

		// Обработка завершения работы
		process.on("SIGTERM", async () => {
			clearInterval(memoryMonitor);
			await moduleManager.stopModules();
			await cleanupOldLogs();
			process.exit(0);
		});

		process.on("SIGINT", async () => {
			clearInterval(memoryMonitor);
			await moduleManager.stopModules();
			await cleanupOldLogs();
			logger.info({
				message: "Shutdown complete",
				moduleState: ModuleState.STOPPED,
			});
			process.exit(0);
		});
	} catch (error) {
		logger.error({
			message: "Fatal error during application startup",
			moduleState: ModuleState.ERROR,
			error,
		});
		process.exit(1);
	}
}

// Запускаем приложение
main().catch((error) => {
	logger.error({
		message: "Unhandled error in main",
		moduleState: ModuleState.ERROR,
		error,
	});
	process.exit(1);
});
