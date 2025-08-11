/**
 * Конфигурация для улучшения работы с YouTube API
 */

export const YOUTUBE_CONFIG = {
	// Таймауты для запросов к YouTube
	TIMEOUTS: {
		SEARCH: 15000, // 15 секунд для поиска
		GET_INFO: 20000, // 20 секунд для получения информации о видео
		GET_URL: 25000, // 25 секунд для получения URL
	},

	// Настройки retry
	RETRY: {
		MAX_ATTEMPTS: 3,
		BASE_DELAY: 1000, // 1 секунда
		MAX_DELAY: 10000, // 10 секунд максимум
	},

	// User-Agent для запросов
	USER_AGENT:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

	// Заголовки для имитации браузера
	HEADERS: {
		Accept:
			"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.5",
		"Accept-Encoding": "gzip, deflate",
		DNT: "1",
		Connection: "keep-alive",
		"Upgrade-Insecure-Requests": "1",
	},

	// Ошибки, которые не стоит повторять
	NON_RETRYABLE_ERRORS: [
		"Video unavailable",
		"Private video",
		"Video is private",
		"Sign in to confirm your age",
		"This video is not available",
		"No playable formats found",
		"Video is not available in your country",
	],

	// Ошибки, которые стоит повторять
	RETRYABLE_ERRORS: [
		"timeout",
		"Connect Timeout",
		"Connection failed",
		"ENOTFOUND",
		"ECONNREFUSED",
		"ECONNRESET",
		"SocketError",
		"UND_ERR_CONNECT_TIMEOUT",
	],
};

/**
 * Проверяет, является ли ошибка повторяемой
 */
export function isRetryableError(error: Error): boolean {
	const errorMessage = error.message.toLowerCase();

	// Сначала проверяем неповторяемые ошибки
	for (const nonRetryable of YOUTUBE_CONFIG.NON_RETRYABLE_ERRORS) {
		if (errorMessage.includes(nonRetryable.toLowerCase())) {
			return false;
		}
	}

	// Затем проверяем повторяемые ошибки
	for (const retryable of YOUTUBE_CONFIG.RETRYABLE_ERRORS) {
		if (errorMessage.includes(retryable.toLowerCase())) {
			return true;
		}
	}

	// По умолчанию не повторяем неизвестные ошибки
	return false;
}

/**
 * Вычисляет задержку для retry с экспоненциальным backoff
 */
export function calculateRetryDelay(
	attempt: number,
	baseDelay: number = YOUTUBE_CONFIG.RETRY.BASE_DELAY,
): number {
	const delay = baseDelay * Math.pow(2, attempt - 1);
	return Math.min(delay, YOUTUBE_CONFIG.RETRY.MAX_DELAY);
}
