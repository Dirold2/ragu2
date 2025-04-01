import NodeCache from "node-cache";
import { bot } from "../bot.js";
import { type Track, TrackSchema } from "../types/index.js";

/**
 * Кэш-реализация QueueService для использования в качестве резервного варианта
 * когда основной QueueService недоступен
 */
export default class CacheQueueService {
	private cache: NodeCache;
	private readonly logger = bot.logger!;
	private readonly locale = bot.locale!;

	constructor(ttl = 3600) {
		this.cache = new NodeCache({
			stdTTL: ttl,
			checkperiod: 120,
			useClones: false,
		});
	}

	/**
	 * Получает трек из очереди
	 */
	async getTrack(guildId: string): Promise<Track | null> {
		try {
			const key = `track:${guildId}`;
			const track = this.cache.get<Track>(key);
			return track || null;
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
	 * Устанавливает трек в очередь
	 */
	async setTrack(guildId: string, track: Track): Promise<void> {
		try {
			// Валидация трека с помощью Zod
			const validatedTrack = TrackSchema.parse(track);
			const key = `track:${guildId}`;
			this.cache.set(key, validatedTrack);

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
	 * Получает ID последнего трека
	 */
	async getLastTrackID(guildId: string): Promise<string | null> {
		try {
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
	async setLastTrackID(guildId: string, trackId: string): Promise<void> {
		try {
			const key = `lastTrack:${guildId}`;
			this.cache.set(key, trackId);
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
			const key = `volume:${guildId}`;
			return this.cache.get<number>(key) || 10; // По умолчанию 10%
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_volume", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return 10;
		}
	}

	/**
	 * Устанавливает громкость
	 */
	async setVolume(guildId: string, volume: number): Promise<void> {
		try {
			const key = `volume:${guildId}`;
			this.cache.set(key, volume);
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
	 * Логирует проигрывание трека (заглушка для кэш-реализации)
	 */
	async logTrackPlay(
		userId: string,
		trackId: string,
		trackInfo: string,
	): Promise<void> {
		// В кэш-реализации просто логируем информацию, но не сохраняем
		this.logger.debug(
			this.locale.t("messages.cacheQueueService.track_played", {
				userId,
				trackId,
				trackInfo,
			}),
		);
	}

	/**
	 * Очищает кэш для гильдии
	 */
	clearGuildCache(guildId: string): void {
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
		this.cache.flushAll();
		this.logger.debug("All cache cleared");
	}
}
