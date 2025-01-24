import type { LocaleMessages, LoggerMessages } from "../types/localization.js";

export const MESSAGES: LocaleMessages = {
	// bot.ts
	BOT_INITIALIZED: "Бот успешно инициализирован",
	BOT_INITIALIZATION_FAILED: "Не удалось инициализировать бота:",
	BOT_STARTED_SUCCESSFULLY: "Бот успешно запущен",
	BOT_START_ERROR: "Ошибка при запуске бота:",
	BOT_TOKEN_ERROR: "Токен бота отсутствует или недействителен.",
	API_SERVER_STARTED_SUCCESSFULLY: "API сервер успешно запущен",
	ERROR_INITIALIZATION: "Ошибка инициализации бота:",

	NOT_CONNECTED_TO_VOICE: "Вы не подключены к голосовому каналу.",
	ERROR_OCCURRED_WHILE_CONNECTING_TO_CHANNEL:
		"Ошибка при подключении к каналу:",

	// dev.ts
	RELOAD_SUCCESS: "Перезагрузка завершена успешно",
	RELOAD_ERROR: "Ошибка при перезагрузке:",

	// Сообщения для кэша
	CACHE_HIT: (url: string) => `Кэш: найдено для URL "${url}"`,

	// Сообщения для голосового канала
	NOT_CONNECTED_TO_VOICE_CHANNEL: "Вы не подключены к голосовому каналу.",
	NO_ACCESS_TO_VOICE_CHANNEL:
		"Нет доступа к голосовому каналу или неверный ID канала.",
	NOT_IN_VOICE_CHANNEL:
		"Для использования этой команды вы должны находиться в голосовом канале.",
	FAILED_TO_INITIALIZE_SERVICES: "Не удалось инициализировать сервисы",

	// Сообщения для воспроизведения
	PLAYBACK_PAUSED: "Воспроизведение приостановлено.",
	PLAYBACK_RESUMED: "Воспроизведение возобновлено.",
	NO_TRACK_PLAYING: "В данный момент ничего не воспроизводится.",
	SKIPPED_TO_NEXT_TRACK: (trackInfo: string) =>
		`Переключение на следующий трек: ${trackInfo}`,
	EMPTY_PLAYLIST: "Плейлист пуст или не может быть загружен.",
	PLAYLIST_ADDED: (count: number) =>
		`В очередь добавлено ${count} треков из плейлиста.`,
	UNSUPPORTED_TRACK_SOURCE: "Выбранный источник трека не поддерживается.",
	ADDED_TO_QUEUE: (trackInfo: string) =>
		`Трек добавлен в очередь: ${trackInfo}`,
	UNSUPPORTED_PLAYLIST_URL: "URL плейлиста не поддерживается",
	ERROR_PROCESSING_PLAYLIST_URL: (pluginName: string, error: string) =>
		`Ошибка обработки URL плейлиста с плагином ${pluginName}: ${error}`,

	// Сообщения для работы с плагинами
	PLUGIN_REGISTERED: (name: string) =>
		`Плагин "${name}" успешно зарегистрирован`,
	PLUGIN_REGISTRATION_FAILED: (name: string) =>
		`Не удалось зарегистрировать плагин "${name}"`,
	PLUGIN_REGISTRATION_FAILED_FATAL:
		"Критическая ошибка при регистрации плагина",
	PLUGIN_FOUND_FOR_URL: (url: string, name: string) =>
		`Плагин для URL "${url}" найден: ${name}`,
	PLUGIN_NOT_FOUND: (pluginName: string) => `Плагин "${pluginName}" не найден.`,
	PLUGIN_INITIALIZATION_FAILED: (pluginName: string) =>
		`Не удалось инициализировать плагин "${pluginName}":`,
	PLUGIN_EXECUTION_ERROR: (pluginName: string, error: string) =>
		`Ошибка выполнения плагина "${pluginName}": ${error}`,

	// Сообщения для управления сообщениями
	MESSAGE_CANNOT_BE_DELETED: (messageId: string) =>
		`Сообщение с ID "${messageId}" не может быть удалено или не существует.`,
	MESSAGE_DELETED: (messageId: string) =>
		`Сообщение с ID "${messageId}" успешно удалено.`,
	UNEXPECTED_ERROR: "Непредвиденная ошибка",
	UNKNOWN_ERROR_DELETING_MESSAGE: (messageId: string) =>
		`Неизвестная ошибка при удалении сообщения с ID "${messageId}":`,
	MESSAGE_NO_LONGER_EXISTS: (messageId: string) =>
		`Сообщение с ID "${messageId}" больше не существует.`,

	// Сообщения для Discord API
	DISCORD_API_ERROR: (code: number, context: string, message: string) =>
		`Ошибка Discord API (${code}) для "${context}": ${message}`,
	UNKNOWN_ERROR_INTERACTION: (interactionId: string) =>
		`Неизвестная ошибка при взаимодействии с ID "${interactionId}":`,
	INTERACTION_NO_LONGER_EXISTS: (interactionId: string) =>
		`Взаимодействие с ID "${interactionId}" больше не существует.`,

	// Сообщения для команды play
	PROVIDE_TRACK: "Пожалуйста, укажите название трека или URL",
	PLAY_TRACK: "Воспроизвести трек",
	NAME_TRACK: "Название трека или URL",
	STARTED_PLAYING: "Начинаю воспроизведение",
	NO_TRACKS_FOUND: (query: string) => `Треки не найдены для "${query}"`,
	PLAYLIST_ADDED_SUCCESS: "Плейлист успешно добавлен",
	PLAY_ERROR: "Не удалось воспроизвести трек. Попробуйте еще раз.",
	AUTOCOMPLETE_ERROR: "Ошибка автодополнения",
	ERROR_PLAYING_TRACK: "Ошибка при воспроизведении трека:",
	PLAYLIST_ADDED_ERROR: "Ошибка при добавлении плейлиста",
	PLAYLIST_ADDED_ERROR_FATAL: "Критическая ошибка при добавлении плейлиста",
	PLAYLIST_ADDED_ERROR_NO_PLUGIN: "Плагин не найден для плейлиста",

	// Сообщения для команды loop
	LOOP_TRACK: "Переключить повтор трека",
	LOOP_TRACK_ON: (trackInfo: string | undefined) =>
		`Повтор трека включен: ${trackInfo}`,
	LOOP_TRACK_OFF: "Повтор трека выключен",
	PLAYER_NOT_FOUND: "Плеер не найден",
	LOOP_TRACK_ERROR: "Ошибка при переключении повтора трека",

	// Сообщения для команды volume
	VOLUME_COMMAND: "Настроить громкость",
	VOLUME_SET: (volume: number) => `Громкость установлена на ${volume}%`,
	VOLUME_ERROR: "Ошибка при настройке громкости",
	VOLUME_ERROR_MAX_VOLUME: (MAX_VOLUME: number) =>
		`Громкость должна быть в диапазоне от 0 до ${MAX_VOLUME}`,

	// Сообщения для команды pause
	PAUSE_COMMAND: "Приостановить или возобновить текущий трек",
	PAUSE_TRACK: "Текущий трек приостановлен",
	RESUME_TRACK: "Текущий трек возобновлен",

	// Сообщения для команды queue
	QUEUE_COMMAND: "Просмотр очереди",
	QUEUE_EMPTY: "Очередь пуста",
	QUEUE_PAGES: (pages: string) => `Страница: ${pages}`,
	QUEUE_TRACKS_ERROR: "Ошибка при получении очереди",
	QUEUE_TRACKS_ERROR_FATAL: "Критическая ошибка при получении очереди",
	QUEUE_ERROR_NOT_IN_VOICE_CHANNEL: "Вы должны находиться в голосовом канале.",
	UNKNOWN_MESSAGE: "Неизвестное сообщение",

	// Сообщения для команды skip
	SKIP_COMMAND: "Пропустить текущую песню",
	SKIP_TRACK: "Текущая песня пропущена, следующая песня",
	SKIP_NO_TRACK: "Нет трека для пропуска",
	SKIP_ERROR: "Ошибка при пропуске трека",

	// Сообщения для сервера
	PORT_IN_USE: (port: number) => `Порт ${port} занят, попробуйте другой`,
	SERVER_ERROR: "Ошибка сервера:",
	SERVER_START_ERROR: "Ошибка при запуске сервера:",
	SERVER_RUNNING_ON_PORT: (port: number) => `Сервер запущен на порту: ${port}`,

	// Дополнительные сообщения
	NO_RECENTLY_PLAYED_TRACKS: "У вас нет недавно прослушанных треков.",
	RECENTLY_PLAYED_TRACKS: "Ваши последние прослушанные треки:",
	NO_POPULAR_TRACKS: "Нет популярных треков.",
	POPULAR_TRACKS: "Популярные треки:",
	QUEUE_CLEARED: "Очередь успешно очищена",
};

export const LOGGER_MESSAGES: LoggerMessages = {
	CACHE_HIT: (url: string) => `Кэш: найдено для URL "${url}"`,
	PLUGIN_REGISTERED: (name: string) =>
		`Плагин "${name}" зарегистрирован успешно`,
	PLUGIN_REGISTRATION_FAILED: (name: string) =>
		`Не удалось зарегистрировать плагин "${name}"`,
	PLUGIN_REGISTRATION_FAILED_FATAL:
		"Критическая ошибка при регистрации плагина",
	PLUGIN_FOUND_FOR_URL: (url: string, name: string) =>
		`Плагин для URL "${url}" найден: ${name}`,
	PLUGIN_NOT_FOUND: (pluginName: string) => `Плагин "${pluginName}" не найден.`,
	PLUGIN_INITIALIZATION_FAILED: (pluginName: string) =>
		`Не удалось инициализировать плагин "${pluginName}":`,
	PLUGIN_EXECUTION_ERROR: (pluginName: string, error: string) =>
		`Ошибка выполнения плагина "${pluginName}": ${error}`,

	BOT_FAILED_INITIALIZATION_SERVICES: "Не удалось инициализировать сервисы",
	BOT_STARTED_SUCCESSFULLY: "Бот успешно запущен",
	BOT_START_ERROR: "Ошибка при запуске бота:",
	API_SERVER_STARTED_SUCCESSFULLY: "API сервер успешно запущен",
	BOT_INITIALIZED: "Бот успешно инициализирован",
	BOT_INITIALIZATION_FAILED: "Не удалось инициализировать бота:",

	DEV_FAILDE_TO_IMPORT_FILE: (file: string) =>
		`Не удалось импортировать ${file}:`,
	DEV_FAILDE_TO_LOAD_FILE_FROM: (src: string) =>
		`Не удалось загрузить файлы из ${src}:`,

	RELOAD_SUCCESS: "Перезагрузка завершена успешно",
	RELOAD_ERROR: "Ошибка при перезагрузке:",
	BOT_NOT_ENV_TOKEN: "Не удалось найти DISCORD_TOKEN в вашем окружении",

	PORT_IN_USE: (port: number) => `Порт ${port} занят, попробуйте другой`,
	SERVER_ERROR: "Ошибка сервера:",
	SERVER_START_ERROR: "Ошибка при запуске сервера:",
	SERVER_RUNNING_ON_PORT: (port: number) => `Сервер запущен на порту: ${port}`,

	EDITING_REPLY_FOR_INTERACTION_ID: (interactionId: string) =>
		`Редактирование ответа для ID взаимодействия: ${interactionId}`,
	SENDING_NEW_REPLY_FOR_INTERACTION_ID: (interactionId: string) =>
		`Отправка нового ответа для ID взаимодействия: ${interactionId}`,
	MESSAGE_NOT_DELETABLE: (messageId: string) =>
		`Сообщение с ID "${messageId}" не может быть удалено или не существует.`,
	MESSAGE_DELETED: (messageId: string) =>
		`Сообщение с ID "${messageId}" успешно удалено.`,
	INTERACTION_NOT_REPLIABLE: (interactionId: string) =>
		`Взаимодействие с ID "${interactionId}" не может быть отправлено.`,
	INTERACTION_ALREADY_REPLIED_TO: (interactionId: string) =>
		`Взаимодействие с ID "${interactionId}" уже отправлено.`,
	INTERACTION_EXPIRED: (interactionId: string) =>
		`Взаимодействие с ID "${interactionId}" истекло: Неизвестное взаимодействие`,
	REPLY_ERROR: "Ошибка при отправке ответа:",
	UNKNOWN_ERROR_INTERACTING_WITH_ID: (interactionId: string) =>
		`Неизвестная ошибка при взаимодействии с ID "${interactionId}":`,
	UNKNOWN_ERROR_DELETING_MESSAGE_WITH_ID: (messageId: string) =>
		`Неизвестная ошибка при удалении сообщения с ID "${messageId}":`,
	DISCORD_API_ERROR: (errorCode: number, context: string) =>
		`Ошибка Discord API (${errorCode}) для "${context}"`,

	SEARCHING_FOR_TRACK_OR_URL: (trackName: string) =>
		`Поиск трека или URL "${trackName}"...`,
	ERROR_SEARCHING_IN_PLUGIN: (pluginName: string) =>
		`Ошибка поиска в плагине "${pluginName}":`,
	ERROR_PROCESSING_URL_WITH_PLUGIN: (pluginName: string) =>
		`Ошибка обработки URL с плагином "${pluginName}":`,
	FAILED_TO_ADD_TRACK: (trackId: string, MAX_RETRIES: number) =>
		`Не удалось добавить трек ${trackId} после ${MAX_RETRIES} попыток:`,
	ERROR_PROCESSING_TRACK: "Ошибка при обработке трека:",

	CREATING_NEW_PLAYER_SERVICE_FOR_GUILD: (guildId: string) =>
		`Создание нового PlayerService для гильдии ${guildId}`,
	ATTEMPTED_TO_LEAVE_CHANNEL_FOR_NON_EXISTENT_PLAYER_IN_GUILD: (
		guildId: string,
	) => `Попытка покинуть канал для несуществующего плеера в гильдии ${guildId}`,

	PLAYER_ERROR: "Ошибка плеера:",
	FAILED_TO_PLAY_QUEUE_TRACK:
		"Не удалось воспроизвести или добавить трек в очередь:",
	ERROR_CONNECTING_TO_CHANNEL: "Ошибка при подключении к каналу:",
	FAILED_TO_GET_URL_FOR_TRACK: "Не удалось получить URL для трека:",
	PLAYBACK_ERROR: "Ошибка воспроизведения:",
	CLEARED_EXISTING_FADEOUT_TIMEOUT: "Удален существующий таймаут fadeOut",
	SET_NEW_FADEOUT_TIMEOUT_FOR_DURATION: (duration: number) =>
		`Установлен новый таймаут fadeOut на ${duration} мс`,
	EMPTY_CHECK_ERROR: "Ошибка проверки на пустоту:",
	CHANNEL_ID_IS_NULL: "ID канала равен null",
	GUILD_NOT_FOUND: "Гильдия не найдена",

	PLUGIN_NOT_FOUND_FOR_URL: (url: string) =>
		`Плагин не найден для URL "${url}"`,
	FAILED_TO_REGISTER_PLUGIN: (name: string) =>
		`Не удалось зарегистрировать плагин "${name}"`,
	PLUGIN_REGISTERED_SUCCESSFULLY: (name: string) =>
		`Плагин "${name}" зарегистрирован успешно`,
	CACHE_HIT_FOR_URL: (url: string) => `Кэш: найдено для URL "${url}"`,

	ADDED_BATCH_OF_TRACKS: (count: number) => `Добавлено ${count} треков`,
	ERROR_ADDING_TRACK_TO_QUEUE: (trackId: string) =>
		`Ошибка добавления трека ${trackId} в очередь`,
	ADDED_BATCH_OF_TRACKS_GUILD: (count: number, guildId: string) =>
		`Добавлено ${count} треков в гильдию ${guildId}`,
	MISSING_REQUIRED_PARAMETERS: "Отсутствуют необходимые параметры",
	GUILD_ID_IS_REQUIRED: "ID гильдии не может быть пустым",
	ERROR_FETCHING_QUEUE_FOR_GUILD: (guildId: string) =>
		`Ошибка получения очереди для гильдии ${guildId}`,
	ERROR_RETRIEVING_TRACK_FROM_QUEUE: (guildId: string) =>
		`Ошибка получения трека из очереди для гильдии ${guildId}`,
	ERROR_CLEARING_QUEUE_FOR_GUILD: (guildId: string) =>
		`Ошибка очистки очереди для гильдии ${guildId}`,
	ERROR_REMOVING_TRACK_FROM_QUEUE: (trackId: string) =>
		`Ошибка удаления трека ${trackId} из очереди`,
	ERROR_LOGGING_PLAY_FOR_TRACK: (trackId: string, userId: string) =>
		`Ошибка логирования воспроизведения трека ${trackId} для пользователя ${userId}`,
	ERROR_FETCHING_LAST_PLAYED_TRACKS_FOR_USER: (userId: string) =>
		`Ошибка получения последних воспроизведенных треков для пользователя ${userId}`,
	ERROR_FETCHING_TOP_PLAYED_TRACKS:
		"Ошибка получения топ-воспроизведенных треков",
	TRACKS_ARRAY_CANNOT_BE_EMPTY: "Массив треков не может быть пустым",
	ERROR_ADDING_TRACKS_TO_QUEUE: "Ошибка добавления треков в очередь",

	ERROR_TRACK_SEARCH: (trackName: string) =>
		`Ошибка поиска трека "${trackName}":`,
	ERROR_PROCESSING_URL: (url: string) => `Ошибка обработки URL "${url}":`,
	ERROR_GETTING_TRACK_URL: (trackId: string) =>
		`Ошибка получения URL для трека ${trackId}:`,
	ERROR_FETCHING_PLAYLIST_TRACKS: (playlistId: string) =>
		`Ошибка получения треков плейлиста ${playlistId}:`,
	ERROR_FETCHING_ALBUM_TRACKS: (albumId: string) =>
		`Ошибка получения треков альбома ${albumId}:`,
	PLAYLIST_NOT_FOUND_OR_EMPTY: (playlistId: string) =>
		`Плейлист ${playlistId} не найден или пуст`,
	NO_SIMILAR_TRACKS_FOUND: (trackId: string) =>
		`Не найдены подобные треки для ${trackId}`,
	ERROR_FETCHING_SIMILAR_TRACKS: (trackId: string) =>
		`Ошибка получения подобных треков для ${trackId}:`,
	INVALID_TRACK_DATA: (error: string) => `Неверные данные трека: ${error}`,
	INVALID_CONFIGURATION: (error: string) => `Неверная конфигурация: ${error}`,
	RETRYING_SEARCH_FOR_TRACK: (trackName: string) =>
		`Повторный поиск трека "${trackName}":`,
	ERROR_INITIALIZING_YANDEX_SERVICE: "Ошибка инициализации YandexService",
	FAILED_TO_INITIALIZE_YANDEX_SERVICE:
		"Не удалось инициализировать YandexService",

	ERROR_PARSING_URL: "Ошибка парсинга URL:",

	ERROR_UNHANDLED_REJECTION: "Необработанное исключение",

	ERROR_AUTOCOMPLETE: "Ошибка автодополнения",
	ERROR_PLAYING_TRACK: "Ошибка при воспроизведении трека:",

	ERROR_RETRIEVING_QUEUE: "Ошибка получения очереди:",
	CRITICAL_ERROR_RETRIEVING_QUEUE: "Критическая ошибка при получении очереди",
	ERROR_SETTING_UP_REACTIONS: "Ошибка при настройке реакций:",

	ERROR_SKIPPING_TRACK: "Ошибка при пропуске трека:",

	ERROR_ADJUSTING_VOLUME: "Ошибка при настройке громкости:",

	PROXY_INITIALIZED_SUCCESSFULLY: "Прокси успешно инициализирован",
	ERROR_INITIALIZING_PROXY: "Ошибка инициализации прокси:",
	PROXY_AGENT_SUCCESSFULLY_RECEIVED: "Прокси-агент успешно получен",
	PROXY_NOT_ENABLED: "Прокси не включен.",
};
