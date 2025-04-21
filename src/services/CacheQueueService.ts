import { LRUCache } from "lru-cache";
import { bot } from "../bot.js";
import { type Track, TrackSchema } from "../types/index.js";
import type { QueueResult } from "../interfaces/index.js";

interface EnhancedQueueResult extends QueueResult {
	loop?: boolean;
	_timestamp?: number;
}

export default class CacheQueueService {
	private cache: LRUCache<string, any>;
	private readonly logger = bot.logger!;
	private readonly locale = bot.locale!;
	private static readonly DEFAULT_VOLUME = 10;
	private static readonly BATCH_SIZE = 50;

	private readonly trackCache = new Map<string, Map<string, Track>>();
	private readonly queueCache: LRUCache<string, EnhancedQueueResult>;
	private readonly CACHE_TTL = 60000;

	constructor(ttl = 3600) {
		this.cache = new LRUCache<string, any>({
			max: 10000,
			ttl: ttl * 1000,
		});

		this.queueCache = new LRUCache<string, EnhancedQueueResult>({
			max: 1000,
			ttl: this.CACHE_TTL,
		});
	}

	async getTrack(guildId: string): Promise<Track | null> {
		try {
			const guildCache = this.trackCache.get(guildId);
			if (guildCache?.size) {
				const firstEntry = guildCache.entries().next();
				if (!firstEntry.done) {
					const [trackId, track] = firstEntry.value;
					guildCache.delete(trackId);
					if (!guildCache.size) this.trackCache.delete(guildId);
					this.cache.delete(`track:${guildId}`);
					return track;
				}
			}

			const key = `track:${guildId}`;
			const track = this.cache.get(key);
			if (track) {
				this.cache.delete(key);
				return track as Track;
			}
			return null;
		} catch (error) {
			this.logger.error(
				this.locale.t(`messages.cacheQueueService.errors.get_track`, {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
			return null;
		}
	}

	async getTrackWithPriority(guildId: string): Promise<Track | null> {
		try {
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				for (const [trackId, track] of guildCache.entries()) {
					if (track.priority) {
						guildCache.delete(trackId);
						if (!guildCache.size) this.trackCache.delete(guildId);
						return track;
					}
				}
			}
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

	async setTrack(guildId: string, track: Omit<Track, "id">): Promise<void> {
		try {
			const validatedTrack = TrackSchema.parse(track);
			let guildCache = this.trackCache.get(guildId) || new Map<string, Track>();
			guildCache.set(track.trackId, validatedTrack);
			this.trackCache.set(guildId, guildCache);

			this.cache.set(`track:${guildId}`, validatedTrack);
			this.invalidateQueueCache(guildId);

			if (track.source === "yandex") {
				await this.setLastTrackID(guildId, track.trackId);
			}
		} catch (error) {
			this.logger.error(
				this.locale.t(`messages.cacheQueueService.errors.set_track`, {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	async setTracks(guildId: string, tracks: Omit<Track, "id">[]): Promise<void> {
		try {
			if (!tracks || tracks.length === 0) return;

			const validatedTracks = tracks.map((track) => TrackSchema.parse(track));
			let guildCache = this.trackCache.get(guildId);
			if (!guildCache) {
				guildCache = new Map<string, Track>();
				this.trackCache.set(guildId, guildCache);
			}

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

					if (track.source === "yandex") {
						await this.setLastTrackID(guildId, track.trackId);
					}
				}
			}

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

	async getQueue(guildId: string): Promise<EnhancedQueueResult> {
		try {
			const cachedQueue = this.queueCache.get(guildId);
			if (cachedQueue) return cachedQueue;

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
				_timestamp: Date.now(),
			};

			this.queueCache.set(guildId, result);
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

	async shuffleTracks(guildId: string): Promise<number> {
		try {
			const guildCache = this.trackCache.get(guildId);
			if (!guildCache || guildCache.size <= 1) return 0;

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
			this.logger.debug(
				`Shuffled ${tracks.length} tracks for guild ${guildId}`,
			);

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

	getLastTrackID(guildId: string): string | null {
		const key = `lastTrack:${guildId}`;
		return this.cache.get(key) || null;
	}

	setLastTrackID(guildId: string, trackId?: string): void {
		const key = `lastTrack:${guildId}`;
		trackId ? this.cache.set(key, trackId) : this.cache.delete(key);

		const queueData = this.queueCache.get(guildId);
		if (queueData) {
			queueData.lastTrackId = trackId;
			this.queueCache.set(guildId, queueData);
		}
	}

	getLoop(guildId: string): boolean {
		const key = `loop:${guildId}`;
		return this.cache.get(key) || false;
	}

	setLoop(guildId: string, loop: boolean): void {
		this.cache.set(`loop:${guildId}`, loop);

		const queueData = this.queueCache.get(guildId);
		if (queueData) {
			queueData.loop = loop;
			this.queueCache.set(guildId, queueData);
		}
	}

	getWave(guildId: string): boolean {
		try {
			const queueData = this.queueCache.get(guildId);
			if (queueData) return queueData.waveStatus || false;

			const key = `wave:${guildId}`;
			return this.cache.get(key) || false;
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

	setWave(guildId: string, wave: boolean): void {
		try {
			const key = `wave:${guildId}`;
			this.cache.set(key, wave);

			const queueData = this.queueCache.get(guildId);
			if (queueData) {
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

	getVolume(guildId: string): number {
		try {
			const queueData = this.queueCache.get(guildId);
			if (queueData)
				return queueData.volume || CacheQueueService.DEFAULT_VOLUME;

			const key = `volume:${guildId}`;
			return this.cache.get(key) || CacheQueueService.DEFAULT_VOLUME;
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

	setVolume(guildId: string, volume: number): void {
		try {
			const key = `volume:${guildId}`;
			this.cache.set(key, Number(volume));

			const queueData = this.queueCache.get(guildId);
			if (queueData) {
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

	countMusicTracks(guildId: string): number {
		try {
			const guildCache = this.trackCache.get(guildId);
			return guildCache?.size || 0;
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

	async removeTrack(guildId: string, trackId: string): Promise<void> {
		try {
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				guildCache.delete(trackId);
				if (guildCache.size === 0) this.trackCache.delete(guildId);
			}
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

	async clearQueue(guildId: string): Promise<void> {
		try {
			this.trackCache.delete(guildId);
			this.queueCache.delete(guildId);

			const keys = [
				`track:${guildId}`,
				`lastTrack:${guildId}`,
				`loop:${guildId}`,
				`wave:${guildId}`,
				`volume:${guildId}`,
			];
			keys.forEach((key) => this.cache.delete(key));

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

	async getLastPlayedTracks(userId: string, limit = 10): Promise<Track[]> {
		this.logger.debug(
			`Requested last played tracks for user ${userId} (limit: ${limit}), but not available in cache implementation`,
		);
		return [];
	}

	async getTopPlayedTracks(limit = 10): Promise<Track[]> {
		this.logger.debug(
			`Requested top played tracks (limit: ${limit}), but not available in cache implementation`,
		);
		return [];
	}

	clearGuildCache(guildId: string): void {
		this.trackCache.delete(guildId);
		this.queueCache.delete(guildId);
		const keys = [
			`track:${guildId}`,
			`lastTrack:${guildId}`,
			`loop:${guildId}`,
			`wave:${guildId}`,
			`volume:${guildId}`,
		];
		keys.forEach((key) => this.cache.delete(key));
	}

	clearAllCache(): void {
		this.trackCache.clear();
		this.queueCache.clear();
		this.cache.clear();
	}

	private invalidateQueueCache(guildId: string): void {
		this.queueCache.delete(guildId);
	}
}
