import { LRUCache } from "lru-cache";
import { bot } from "../bot.js";
import { type Track, TrackSchema } from "../types/index.js";
import type { QueueResult } from "../interfaces/index.js";
import config from "../../config.json" with { type: "json" };

interface EnhancedQueueResult extends QueueResult {
	loop?: boolean;
	_timestamp?: number;
}

export default class CacheQueueService {
	private cache: LRUCache<string, any>;
	private readonly logger = bot.logger!;
	private readonly locale = bot.locale!;
	private static readonly DEFAULT_VOLUME = config.volume.default * 100 || 20;
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
			this.logger.debug(`[CacheQueueService] getTrack called for guild ${guildId}`);
			
			const guildCache = this.trackCache.get(guildId);
			if (guildCache?.size) {
				const firstEntry = guildCache.entries().next();
				if (!firstEntry.done) {
					const [trackId, track] = firstEntry.value;
					guildCache.delete(trackId);
					if (!guildCache.size) this.trackCache.delete(guildId);
					this.cache.delete(`track:${guildId}`);
					this.logger.debug(`[CacheQueueService] Returning track from guildCache: ${track.info}`);
					return track;
				}
			}

			const key = `track:${guildId}`;
			const track = this.cache.get(key);
			if (track) {
				this.cache.delete(key);
				this.logger.debug(`[CacheQueueService] Returning track from cache: ${track.info}`);
				return track as Track;
			}
			
			this.logger.debug(`[CacheQueueService] No track found for guild ${guildId}`);
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
			this.logger.debug(`[CacheQueueService] getTrackWithPriority called for guild ${guildId}`);
			
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				for (const [trackId, track] of guildCache.entries()) {
					if (track.priority) {
						guildCache.delete(trackId);
						if (!guildCache.size) this.trackCache.delete(guildId);
						this.logger.debug(`[CacheQueueService] Returning priority track: ${track.info}`);
						return track;
					}
				}
			}
			
			this.logger.debug(`[CacheQueueService] No priority track found for guild ${guildId}`);
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
			this.logger.debug(`[CacheQueueService] setTrack called for guild ${guildId}, track: ${track.info}`);
			// Adding explicit track implies new user intent: reset wave state
			this.clearWaveState(guildId);
			
			const validatedTrack = TrackSchema.parse(track);
			let guildCache = this.trackCache.get(guildId) || new Map<string, Track>();
			guildCache.set(track.trackId, validatedTrack);
			this.trackCache.set(guildId, guildCache);

			this.cache.set(`track:${guildId}`, validatedTrack);
			this.invalidateQueueCache(guildId);

			if (track.source === "yandex") {
				this.setLastTrackID(guildId, track.trackId);
			}
			
			this.logger.debug(`[CacheQueueService] Track added to queue for guild ${guildId}, cache size: ${guildCache.size}`);
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
			this.logger.debug(`[CacheQueueService] setTracks called for guild ${guildId}, tracks count: ${tracks.length}`);
			// Adding a batch (e.g., playlist) also resets wave state
			this.clearWaveState(guildId);
			
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
						this.setLastTrackID(guildId, track.trackId);
					}
				}
			}

			this.invalidateQueueCache(guildId);
			this.logger.debug(`[CacheQueueService] Tracks added to queue for guild ${guildId}, cache size: ${guildCache.size}`);
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
			this.logger.debug(`[CacheQueueService] getQueue called for guild ${guildId}`);
			
			const cachedQueue = this.queueCache.get(guildId);
			if (cachedQueue) {
				this.logger.debug(`[CacheQueueService] Returning cached queue for guild ${guildId}`);
				return cachedQueue;
			}

			const tracks = Array.from(this.trackCache.get(guildId)?.values() || []);
			const lastTrackId = this.getLastTrackID(guildId);
			const waveStatus = this.getWave(guildId);
			const volume = this.getVolume(guildId);
			const loop = this.getLoop(guildId);

			this.logger.debug(`[CacheQueueService] Building queue for guild ${guildId}: ${tracks.length} tracks, wave: ${waveStatus}, loop: ${loop}`);

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
				}),
				error instanceof Error ? error.message : String(error),
			);
			return {
				tracks: [],
				lastTrackId: undefined,
				waveStatus: false,
				volume: CacheQueueService.DEFAULT_VOLUME,
				loop: false,
			};
		}
	}

	async getQueueLength(guildId: string): Promise<number> {
		try {
			this.logger.debug(`[CacheQueueService] getQueueLength called for guild ${guildId}`);
			
			// Если есть кэшированная очередь, используем её
			const cachedQueue = this.queueCache.get(guildId);
			if (cachedQueue) {
				this.logger.debug(`[CacheQueueService] Returning queue length from cache: ${cachedQueue.tracks.length}`);
				return cachedQueue.tracks.length;
			}

			// Иначе получаем из trackCache
			const tracks = this.trackCache.get(guildId);
			const length = tracks ? tracks.size : 0;
			this.logger.debug(`[CacheQueueService] Returning queue length from trackCache: ${length}`);
			return length;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_queue_length", {
					guildId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return 0;
		}
	}

	async shuffleTracks(guildId: string): Promise<number> {
		try {
			this.logger.debug(`[CacheQueueService] shuffleTracks called for guild ${guildId}`);
			
			const guildCache = this.trackCache.get(guildId);
			if (!guildCache || guildCache.size <= 1) {
				this.logger.debug(`[CacheQueueService] No tracks to shuffle for guild ${guildId}`);
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
			this.logger.debug(
				`[CacheQueueService] Shuffled ${tracks.length} tracks for guild ${guildId}`,
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
		this.logger.debug(`[CacheQueueService] getLastTrackID called for guild ${guildId}`);
		const key = `lastTrack:${guildId}`;
		const lastTrackId = this.cache.get(key) || null;
		this.logger.debug(`[CacheQueueService] Returning lastTrackId: ${lastTrackId}`);
		return lastTrackId;
	}

	setLastTrackID(guildId: string, trackId?: string): void {
		this.logger.debug(`[CacheQueueService] setLastTrackID called for guild ${guildId}, trackId: ${trackId}`);
		const key = `lastTrack:${guildId}`;
		trackId ? this.cache.set(key, trackId) : this.cache.delete(key);

		const queueData = this.queueCache.get(guildId);
		if (queueData) {
			queueData.lastTrackId = trackId;
			this.queueCache.set(guildId, queueData);
		}
	}

	getLoop(guildId: string): boolean {
		this.logger.debug(`[CacheQueueService] getLoop called for guild ${guildId}`);
		const key = `loop:${guildId}`;
		const loopStatus = this.cache.get(key) || false;
		this.logger.debug(`[CacheQueueService] Returning loop status: ${loopStatus}`);
		return loopStatus;
	}

	setLoop(guildId: string, loop: boolean): void {
		this.logger.debug(`[CacheQueueService] setLoop called for guild ${guildId}, loop: ${loop}`);
		this.cache.set(`loop:${guildId}`, loop);

		const queueData = this.queueCache.get(guildId);
		if (queueData) {
			queueData.loop = loop;
			this.queueCache.set(guildId, queueData);
		}
	}

	getWave(guildId: string): boolean {
		try {
			this.logger.debug(`[CacheQueueService] getWave called for guild ${guildId}`);
			
			const queueData = this.queueCache.get(guildId);
			if (queueData) {
				this.logger.debug(`[CacheQueueService] Returning wave status from queue cache: ${queueData.waveStatus}`);
				return queueData.waveStatus ?? false;
			}

			const key = `wave:${guildId}`;
			const waveStatus = (this.cache.get(key) as boolean | undefined) ?? false;
			this.logger.debug(`[CacheQueueService] Returning wave status from cache: ${waveStatus}`);
			return waveStatus;
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

	clearWaveState(guildId: string): void {
		this.logger.debug(`[CacheQueueService] clearWaveState called for guild ${guildId}`);
		this.cache.delete(`waveSeed:${guildId}`);
		this.cache.delete(`wavePos:${guildId}`);
	}

	setWave(guildId: string, wave: boolean): void {
		try {
			this.logger.debug(`[CacheQueueService] setWave called for guild ${guildId}, wave: ${wave}`);
			const key = `wave:${guildId}`;
			this.cache.set(key, wave);
			if (!wave) {
				this.clearWaveState(guildId);
			}

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
			this.logger.debug(`[CacheQueueService] getVolume called for guild ${guildId}`);
			
			const queueData = this.queueCache.get(guildId);
			if (queueData) {
				this.logger.debug(`[CacheQueueService] Returning volume from queue cache: ${queueData.volume}`);
				return queueData.volume || CacheQueueService.DEFAULT_VOLUME;
			}

			const key = `volume:${guildId}`;
			const volume = this.cache.get(key) || CacheQueueService.DEFAULT_VOLUME;
			this.logger.debug(`[CacheQueueService] Returning volume from cache: ${volume}`);
			return volume;
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
			this.logger.debug(`[CacheQueueService] setVolume called for guild ${guildId}, volume: ${volume}`);
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
			this.logger.debug(`[CacheQueueService] countMusicTracks called for guild ${guildId}`);
			const guildCache = this.trackCache.get(guildId);
			const count = guildCache?.size || 0;
			this.logger.debug(`[CacheQueueService] Track count for guild ${guildId}: ${count}`);
			return count;
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
			this.logger.debug(`[CacheQueueService] removeTrack called for guild ${guildId}, trackId: ${trackId}`);
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				guildCache.delete(trackId);
				if (guildCache.size === 0) this.trackCache.delete(guildId);
				this.logger.debug(`[CacheQueueService] Track removed, remaining tracks: ${guildCache.size}`);
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
			this.logger.debug(`[CacheQueueService] clearQueue called for guild ${guildId}`);
			this.trackCache.delete(guildId);
			this.queueCache.delete(guildId);

			const keys = [
				`track:${guildId}`,
				`lastTrack:${guildId}`,
				`loop:${guildId}`,
				`wave:${guildId}`,
				`volume:${guildId}`,
				`waveSeed:${guildId}`,
				`wavePos:${guildId}`,
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
		this.logger.debug(`[CacheQueueService] logTrackPlay called for user ${userId}, trackId: ${trackId}, trackInfo: ${trackInfo}`);
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
			`[CacheQueueService] getLastPlayedTracks called for user ${userId} with limit ${limit}, but not available in cache implementation`,
		);
		return [];
	}

	async getTopPlayedTracks(limit = 10): Promise<Track[]> {
		this.logger.debug(
			`[CacheQueueService] getTopPlayedTracks called with limit ${limit}, but not available in cache implementation`,
		);
		return [];
	}

	async peekTrack(guildId: string): Promise<Track | null> {
		try {
			this.logger.debug(`[CacheQueueService] peekTrack called for guild ${guildId}`);
			const guildCache = this.trackCache.get(guildId);
			if (guildCache?.size) {
				const firstEntry = guildCache.entries().next();
				if (!firstEntry.done) {
					const [, track] = firstEntry.value;
					this.logger.debug(`[CacheQueueService] Peek track from guildCache: ${track.info}`);
					return track;
				}
			}
			const key = `track:${guildId}`;
			const track = this.cache.get(key) as Track | undefined;
			if (track) {
				this.logger.debug(`[CacheQueueService] Peek track from cache: ${track.info}`);
				return track;
			}
			this.logger.debug(`[CacheQueueService] No track to peek for guild ${guildId}`);
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

	clearGuildCache(guildId: string): void {
		this.logger.debug(`[CacheQueueService] clearGuildCache called for guild ${guildId}`);
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
		this.logger.debug(`[CacheQueueService] clearAllCache called`);
		this.trackCache.clear();
		this.queueCache.clear();
		this.cache.clear();
	}

	private invalidateQueueCache(guildId: string): void {
		this.logger.debug(`[CacheQueueService] Invalidating queue cache for guild ${guildId}`);
		this.queueCache.delete(guildId);
	}
}
