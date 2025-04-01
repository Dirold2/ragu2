import { bot } from "../bot.js";
import { CacheQueueService } from "../services/index.js";

/**
 * Интервал проверки доступности базы данных (в миллисекундах)
 */
const DB_CHECK_INTERVAL = 60000; // 1 минута

/**
 * Мониторит доступность QueueService из базы данных и переключается обратно при восстановлении
 */
export function startQueueServiceMonitor(): void {
	const logger = bot.logger;
	let checkInterval: ReturnType<typeof setTimeout> | null = null;

	// Функция для проверки доступности базы данных
	const checkDatabaseAvailability = async () => {
		try {
			// Если текущий QueueService - это CacheQueueService, пробуем получить QueueService из базы данных
			if (bot.queueService instanceof CacheQueueService && bot.databaseModule) {
				const dbQueueService = bot.databaseModule.exports.getQueueService();

				// Проверяем, что сервис доступен, выполнив тестовый запрос
				if (dbQueueService) {
					try {
						// Пробуем выполнить простую операцию для проверки соединения
						await dbQueueService.getVolume("test");

						logger.info(
							"База данных снова доступна. Переключаемся на QueueService из базы данных.",
						);

						// Сохраняем ссылку на кэш-сервис для миграции данных
						// const cacheService = bot.queueService as CacheQueueService

						// Устанавливаем QueueService из базы данных
						bot.queueService = dbQueueService;

						// Останавливаем интервал проверки
						if (checkInterval) {
							clearInterval(checkInterval);
							checkInterval = null;
						}

						// Опционально: можно добавить миграцию данных из кэша в базу данных
						// Это может быть полезно, если во время работы с кэшем были добавлены новые треки
						// migrateDataFromCache(cacheService, dbQueueService);
					} catch (error) {
						logger.debug(`Тестовый запрос к базе данных не удался: ${error}`);
					}
				}
			} else if (
				!(bot.queueService instanceof CacheQueueService) &&
				checkInterval
			) {
				// Если мы уже используем QueueService из базы данных, останавливаем мониторинг
				clearInterval(checkInterval);
				checkInterval = null;
			}
		} catch (error) {
			logger.debug(`Ошибка при проверке доступности базы данных: ${error}`);
		}
	};

	// Запускаем интервал проверки только если используется CacheQueueService
	if (bot.queueService instanceof CacheQueueService) {
		checkInterval = setInterval(checkDatabaseAvailability, DB_CHECK_INTERVAL);
		logger.info(
			`Мониторинг доступности базы данных запущен с интервалом ${DB_CHECK_INTERVAL}ms`,
		);
	}
}
