import type { SearchTrackResult } from "../types/index.js";

export interface MusicServicePlugin {
	/** Уникальное имя плагина (например, "yandex", "spotify"). */
	name: string;

	/** Регулярные выражения для матчинга URL, по которым этот плагин должен обрабатываться. */
	urlPatterns: RegExp[];

	/** Если true — плагин зарегистрирован, но временно отключён. */
	disabled?: boolean;

	/**
	 * Поиск трека по названию.
	 * Возвращает массив результатов поиска в общем формате SearchTrackResult.
	 */
	searchName(trackName: string): Promise<SearchTrackResult[]>;

	/**
	 * Поиск по URL (например, трек/плейлист/альбом).
	 * Возвращает массив результатов (трек(и)), если URL поддерживается.
	 */
	searchURL(url: string): Promise<SearchTrackResult[]>;

	/**
	 * Получить прямой URL аудиопотока по trackId,
	 * используется плеером для реального воспроизведения.
	 */
	getTrackUrl(trackId: string): Promise<string | null>;

	/**
	 * Опционально: разобрать URL плейлиста и вернуть набор треков/очередь.
	 */
	getPlaylistURL?(url: string): Promise<QueueResult>;

	/**
	 * Опционально: получить рекомендации по треку (авторадио / похожие).
	 */
	getRecommendations?(trackId: string): Promise<SearchTrackResult[]>;

	/**
	 * Опционально: асинхронная проверка, умеет ли плагин обрабатывать данный URL
	 * (если нужно более сложное, чем простое RegExp-сопоставление).
	 */
	includesUrl?(url: string): Promise<boolean>;
}

export interface Track {
	/** Отформатированная строка для отображения (например, "Artist – Title"). */
	info: string;
	/** Источник (например, "yandex", "spotify", "url"). */
	source: string;
	/** Идентификатор трека в системе конкретного плагина. */
	trackId: string;

	addedAt?: bigint;
	priority?: boolean;
	waveStatus?: boolean;
	requestedBy?: string;
	durationMs?: number;

	/**
	 * Флаг, что трек был сгенерирован (рекомендации/радио),
	 * а не явно запрошен пользователем.
	 */
	generation: boolean;
}

export interface QueueResult {
	/** Треки, которые следует добавить в очередь. */
	tracks: Track[];

	/** Идентификатор последнего трека (если есть). */
	lastTrackId?: string;

	/** Сам последний трек (если нужно сохранить больше метаданных, чем ID). */
	lastTrack?: Track;

	/** Состояние "волны" (авторадио/рек. режим). */
	waveStatus?: boolean;

	/** Рекомендуемая громкость для этого набора треков. */
	volume?: number;
}

/**
 * Вспомогательная структура для описания трека в плейлисте,
 * ближе к "сырым" данным сервиса (например, Яндекс.Музыка).
 */
export interface PlaylistTrack {
	id: number;
	track: {
		id: number;
		title: string;
		artists: ReadonlyArray<{ name: string }>;
		albums: ReadonlyArray<{ title: string }>;
		durationMs: number;
		coverUri: string;
	};
}
