/**
 * Время ожидания при попытке восстановления соединения в миллисекундах.
 * Используется для обработки временных разрывов в подключении к голосовому каналу.
 */
export const RECONNECTION_TIMEOUT = 1000;

/**
 * Интервал проверки наличия участников в голосовом канале в миллисекундах.
 * Используется для определения, когда канал считается пустым и требует отключения бота.
 */
export const EMPTY_CHANNEL_CHECK_INTERVAL = 10000;

/**
 * Значение по умолчанию для уровня громкости воспроизведения в процентах.
 * Используется при отсутствии явного указания уровня громкости и при инициализации PlayerService.
 */
export const DEFAULT_VOLUME = 10;