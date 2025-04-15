import NodeCache from "node-cache";
import { bot } from "../bot.js";
import { type Track, TrackSchema } from "../types/index.js";
import type { QueueResult } from "../interfaces/index.js";

// Расширяем интерфейс QueueResult для поддержки loop
interface EnhancedQueueResult extends QueueResult {
	loop?: boolean;
}

/**
 * Кэш-реализация QueueService для использования в качестве резервного варианта
 * когда основной QueueService недоступен
 */
export default class CacheQueueService {
	private cache: NodeCache;
	private readonly logger = bot.logger!;
	private readonly locale = bot.locale!;
	private static readonly DEFAULT_VOLUME = 10;
	private static readonly BATCH_SIZE = 50;

	// Структура кэша для треков и очередей
	private readonly trackCache = new Map<string, Map<string, Track>>();
	private readonly queueCache = new Map<string, EnhancedQueueResult>();
	private readonly CACHE_TTL = 60000; // 1 минута

	constructor(ttl = 3600) {
		this.cache = new NodeCache({
			stdTTL: ttl,
			checkperiod: 120,
			useClones: false,
		});

		// Инициализируем периодическую очистку кэша
		setInterval(() => this.cleanupExpiredCache(), this.CACHE_TTL);
	}

	/**
	 * Получает трек из очереди
	 */
	async getTrack(guildId: string): Promise<Track | null> {
		try {
			// Проверяем кэш
			const guildCache = this.trackCache.get(guildId);
			if (guildCache && guildCache.size > 0) {
				// Получаем первый трек из кэша
				const entries = Array.from(guildCache.entries());
				if (entries.length > 0) {
					const [trackId, track] = entries[0];
					guildCache.delete(trackId);

					// Если кэш пуст, удаляем его
					if (guildCache.size === 0) {
						this.trackCache.delete(guildId);
					}

					return track;
				}
			}

			// Если в кэше нет, проверяем NodeCache
			const key = `track:${guildId}`;
			const track = this.cache.get<Track>(key);
			if (track) {
				this.cache.del(key);
				return track;
			}

			return null;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_track", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return null;
		}
	}

	/**
	 * Получает трек с приоритетом из очереди
	 */
	async getTrackWithPriority(guildId: string): Promise<Track | null> {
		try {
			// Проверяем кэш на наличие приоритетных треков
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				for (const [trackId, track] of guildCache.entries()) {
					if (track.priority) {
						guildCache.delete(trackId);
						return track;
					}
				}
			}

			// Если в кэше нет приоритетных треков, возвращаем null
			return null;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_priority_track", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return null;
		}
	}

	/**
	 * Устанавливает трек в очередь
	 */
	async setTrack(guildId: string, track: Omit<Track, "id">): Promise<void> {
		try {
			// Валидация трека с помощью Zod
			const validatedTrack = TrackSchema.parse(track);

			// Добавляем в Map кэш
			let guildCache = this.trackCache.get(guildId);
			if (!guildCache) {
				guildCache = new Map<string, Track>();
				this.trackCache.set(guildId, guildCache);
			}
			guildCache.set(track.trackId, validatedTrack);

			// Также сохраняем в NodeCache для совместимости
			const key = `track:${guildId}`;
			this.cache.set(key, validatedTrack);

			// Инвалидируем кэш очереди
			this.invalidateQueueCache(guildId);

			// Сохраняем ID трека как последний проигранный
			if (track.source === "yandex") {
				await this.setLastTrackID(guildId, track.trackId);
			}
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.set_track", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * Устанавливает несколько треков в очередь
	 */
	async setTracks(guildId: string, tracks: Omit<Track, "id">[]): Promise<void> {
		try {
			// Skip processing and don't log warnings if tracks array is empty
			if (!tracks || tracks.length === 0) {
				return;
			}

			// Валидация треков с помощью Zod
			const validatedTracks = tracks.map((track) => TrackSchema.parse(track));

			// Добавляем в Map кэш
			let guildCache = this.trackCache.get(guildId);
			if (!guildCache) {
				guildCache = new Map<string, Track>();
				this.trackCache.set(guildId, guildCache);
			}

			// Обрабатываем треки батчами для оптимизации
			for (
				let i = 0;
				i < validatedTracks.length;
				i += CacheQueueService.BATCH_SIZE
			) {
				const batch = validatedTracks.slice(
					i,
					i + CacheQueueService.BATCH_SIZE,
				);
				for (const track of batch) {
					guildCache.set(track.trackId, track);
				}
			}

			// Инвалидируем кэш очереди
			this.invalidateQueueCache(guildId);
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.set_tracks", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * Получает текущее состояние очереди
	 */
	async getQueue(guildId: string): Promise<EnhancedQueueResult> {
		try {
			// Проверяем кэш
			if (this.queueCache.has(guildId)) {
				return this.queueCache.get(guildId)!;
			}

			// Собираем данные из разных источников кэша
			const tracks = Array.from(this.trackCache.get(guildId)?.values() || []);
			const lastTrackId = await this.getLastTrackID(guildId);
			const waveStatus = await this.getWave(guildId);
			const volume = await this.getVolume(guildId);
			const loop = await this.getLoop(guildId);

			const result: EnhancedQueueResult = {
				tracks,
				lastTrackId: lastTrackId || undefined,
				waveStatus: waveStatus || false,
				volume,
				loop,
			};

			// Кэшируем результат
			this.queueCache.set(guildId, result);

			// Устанавливаем TTL для кэша
			setTimeout(() => {
				this.queueCache.delete(guildId);
			}, this.CACHE_TTL);

			return result;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_queue", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return { tracks: [], waveStatus: false, loop: false };
		}
	}

	/**
	 * Перемешивает треки в очереди
	 * @param guildId ID гильдии
	 * @returns Количество перемешанных треков
	 */
	async shuffleTracks(guildId: string): Promise<number> {
		try {
			const guildCache = this.trackCache.get(guildId);
			if (!guildCache || guildCache.size <= 1) {
				return 0;
			}

			const tracks = Array.from(guildCache.values());
			const trackIds = Array.from(guildCache.keys());
			
			for (let i = tracks.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[tracks[i], tracks[j]] = [tracks[j], tracks[i]];
				[trackIds[i], trackIds[j]] = [trackIds[j], trackIds[i]];
			}
			
			guildCache.clear();
			
			for (let i = 0; i < tracks.length; i++) {
				guildCache.set(trackIds[i], tracks[i]);
			}
			
			this.invalidateQueueCache(guildId);
			
			this.logger.debug(`Shuffled ${tracks.length} tracks for guild ${guildId}`);
			
			return tracks.length;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.shuffle_tracks", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return 0;
		}
	}

	/**
	 * Получает ID последнего трека
	 */
	async getLastTrackID(guildId: string): Promise<string | null> {
		try {
			// Проверяем кэш очереди
			if (this.queueCache.has(guildId)) {
				return this.queueCache.get(guildId)!.lastTrackId || null;
			}

			const key = `lastTrack:${guildId}`;
			return this.cache.get<string>(key) || null;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_last_track", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return null;
		}
	}

	/**
	 * Устанавливает ID последнего трека
	 */
	async setLastTrackID(guildId: string, trackId?: string): Promise<void> {
		try {
			const key = `lastTrack:${guildId}`;

			if (trackId) {
				this.cache.set(key, trackId);
			} else {
				this.cache.del(key);
			}

			// Обновляем кэш очереди
			if (this.queueCache.has(guildId)) {
				const queueData = this.queueCache.get(guildId)!;
				queueData.lastTrackId = trackId;
				this.queueCache.set(guildId, queueData);
			}
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.set_last_track", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * Получает состояние повтора
	 */
	async getLoop(guildId: string): Promise<boolean> {
		try {
			// Проверяем кэш очереди
			if (this.queueCache.has(guildId)) {
				return !!this.queueCache.get(guildId)!.loop;
			}

			const key = `loop:${guildId}`;
			return this.cache.get<boolean>(key) || false;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_loop", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return false;
		}
	}

	/**
	 * Устанавливает состояние повтора
	 */
	async setLoop(guildId: string, loop: boolean): Promise<void> {
		try {
			const key = `loop:${guildId}`;
			this.cache.set(key, loop);

			// Обновляем кэш очереди
			if (this.queueCache.has(guildId)) {
				const queueData = this.queueCache.get(guildId)!;
				queueData.loop = loop;
				this.queueCache.set(guildId, queueData);
			}

			this.logger.debug(`Loop set to ${loop} for guild ${guildId}`);
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.set_loop", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * Получает состояние волны
	 */
	async getWave(guildId: string): Promise<boolean> {
		try {
			// Проверяем кэш очереди
			if (this.queueCache.has(guildId)) {
				return this.queueCache.get(guildId)!.waveStatus || false;
			}

			const key = `wave:${guildId}`;
			return this.cache.get<boolean>(key) || false;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_wave", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return false;
		}
	}

	/**
	 * Устанавливает состояние волны
	 */
	async setWave(guildId: string, wave: boolean): Promise<void> {
		try {
			const key = `wave:${guildId}`;
			this.cache.set(key, wave);

			// Обновляем кэш очереди
			if (this.queueCache.has(guildId)) {
				const queueData = this.queueCache.get(guildId)!;
				queueData.waveStatus = wave;
				this.queueCache.set(guildId, queueData);
			}
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.set_wave", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * Получает громкость
	 */
	async getVolume(guildId: string): Promise<number> {
		try {
			// Проверяем кэш очереди
			if (this.queueCache.has(guildId)) {
				return (
					this.queueCache.get(guildId)!.volume ||
					CacheQueueService.DEFAULT_VOLUME
				);
			}

			const key = `volume:${guildId}`;
			return this.cache.get<number>(key) || CacheQueueService.DEFAULT_VOLUME;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_volume", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return CacheQueueService.DEFAULT_VOLUME;
		}
	}

	/**
	 * Устанавливает громкость
	 */
	async setVolume(guildId: string, volume: number): Promise<void> {
		try {
			const key = `volume:${guildId}`;
			this.cache.set(key, Number(volume));

			// Обновляем кэш очереди
			if (this.queueCache.has(guildId)) {
				const queueData = this.queueCache.get(guildId)!;
				queueData.volume = Number(volume);
				this.queueCache.set(guildId, queueData);
			}
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.set_volume", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * Подсчитывает музыкальные треки в очереди
	 */
	async countMusicTracks(guildId: string): Promise<number> {
		try {
			// Проверяем кэш
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				return guildCache.size;
			}
			return 0;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.count_tracks", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return 0;
		}
	}

	/**
	 * Удаляет трек из очереди
	 */
	async removeTrack(guildId: string, trackId: string): Promise<void> {
		try {
			// Удаляем из Map кэша
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				guildCache.delete(trackId);

				if (guildCache.size === 0) {
					this.trackCache.delete(guildId);
				}
			}

			// Инвалидируем кэш очереди
			this.invalidateQueueCache(guildId);
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.remove_track", {
					guildId,
					trackId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * Очищает очередь
	 */
	async clearQueue(guildId: string): Promise<void> {
		try {
			// Очищаем кэш треков
			this.trackCache.delete(guildId);

			// Очищаем кэш очереди
			this.queueCache.delete(guildId);

			// Очищаем NodeCache
			const keys = [`track:${guildId}`, `lastTrack:${guildId}`];
			keys.forEach((key) => this.cache.del(key));

			this.logger.debug(`Queue cleared for guild ${guildId}`);
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.clear_queue", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * Логирует проигрывание трека
	 * В кэш-реализации просто логируем, но не сохраняем историю
	 */
	async logTrackPlay(
		userId: string,
		trackId: string,
		trackInfo: string,
	): Promise<void> {
		this.logger.debug(
			this.locale.t("messages.cacheQueueService.track_played", {
				userId,
				trackId,
				trackInfo,
			}),
		);
	}

	/**
	 * Получает последние воспроизведенные треки для пользователя
	 * В кэш-реализации возвращаем пустой массив
	 */
	async getLastPlayedTracks(userId: string, limit = 10): Promise<Track[]> {
		this.logger.debug(
			`Requested last played tracks for user ${userId} (limit: ${limit}), but not available in cache implementation`,
		);
		return [];
	}

	/**
	 * Получает самые популярные треки
	 * В кэш-реализации возвращаем пустой массив
	 */
	async getTopPlayedTracks(limit = 10): Promise<Track[]> {
		this.logger.debug(
			`Requested top played tracks (limit: ${limit}), but not available in cache implementation`,
		);
		return [];
	}

	/**
	 * Очищает кэш для гильдии
	 */
	clearGuildCache(guildId: string): void {
		// Очищаем Map кэши
		this.trackCache.delete(guildId);
		this.queueCache.delete(guildId);

		// Очищаем NodeCache
		const keys = [
			`track:${guildId}`,
			`lastTrack:${guildId}`,
			`loop:${guildId}`,
			`wave:${guildId}`,
			`volume:${guildId}`,
		];

		keys.forEach((key) => this.cache.del(key));
		this.logger.debug(`Cache cleared for guild ${guildId}`);
	}

	/**
	 * Очищает весь кэш
	 */
	clearAllCache(): void {
		// Очищаем Map кэши
		this.trackCache.clear();
		this.queueCache.clear();

		// Очищаем NodeCache
		this.cache.flushAll();
		this.logger.debug("All cache cleared");
	}

	/**
	 * Инвалидирует кэш очереди
	 */
	private invalidateQueueCache(guildId: string): void {
		this.queueCache.delete(guildId);
	}

	/**
	 * Очищает устаревшие записи в кэше
	 */
	private cleanupExpiredCache(): void {
		const now = Date.now();

		// Очищаем устаревшие записи в queueCache
		for (const [guildId, queueData] of this.queueCache.entries()) {
			if (
				(queueData as any)._timestamp &&
				(queueData as any)._timestamp + this.CACHE_TTL < now
			) {
				this.queueCache.delete(guildId);
			}
		}

		this.logger.debug("Cache cleanup completed");
	}
}
