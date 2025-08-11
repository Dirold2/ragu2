import { bot } from "../bot.js";
import { createLogger } from "./logger.js";

const logger = createLogger("GracefulShutdown");

/**
 * Graceful shutdown handler для правильного завершения приложения
 */
export async function gracefulShutdown(signal: string): Promise<void> {
	logger.info(`Received ${signal}, starting graceful shutdown...`);

	try {
		// 1. Остановить прием новых команд
		logger.info("Stopping command processing...");
		// Здесь можно добавить логику остановки обработки команд

		// 2. Остановить все активные плееры
		logger.info("Stopping all active players...");
		if (bot?.playerManager) {
			await bot.playerManager.shutdown();
		}

		// 3. Завершить все FFmpeg процессы
		logger.info("Terminating FFmpeg processes...");
		// FFmpegManager автоматически завершит процессы при уничтожении

		// 4. Закрыть все соединения с Discord
		logger.info("Disconnecting from Discord...");
		if (bot?.client) {
			await bot.client.destroy();
		}

		// 5. Закрыть логгер
		logger.info("Closing logger...");
		// Winston автоматически закроет транспорты при завершении процесса

		logger.info("Graceful shutdown completed successfully");
		process.exit(0);
	} catch (error) {
		logger.error(`Error during graceful shutdown: ${error}`);
		process.exit(1);
	}
}

/**
 * Регистрирует обработчики для graceful shutdown
 */
export function registerShutdownHandlers(): void {
	const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];

	signals.forEach((signal) => {
		process.once(signal, () => {
			logger.info(`Received ${signal}, initiating shutdown...`);
			gracefulShutdown(signal).catch((error) => {
				logger.error(`Failed to shutdown gracefully: ${error}`);
				process.exit(1);
			});
		});
	});

	// Note: global exception/rejection handlers are registered in logger/errorHandler
	// to avoid duplicate handling here that could race and cause write-after-end.
}
