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
	private readonly logger = bot.logger!;
	private readonly locale = bot.locale!;
	private static readonly DEFAULT_VOLUME = config.volume.default * 100 || 20;
	private static readonly CACHE_TTL = 60000;

	private readonly trackCache = new Map<string, Map<string, Track>>();
	private readonly queueCache: LRUCache<string, EnhancedQueueResult>;
	private readonly metaCache: LRUCache<string, any>; // For volume, loop, wave, etc.

	constructor(ttl = 3600) {
		this.queueCache = new LRUCache<string, EnhancedQueueResult>({
			max: 1000,
			ttl: CacheQueueService.CACHE_TTL,
		});

		this.metaCache = new LRUCache<string, any>({
			max: 5000,
			ttl: ttl * 1000,
		});
	}

	async getTrack(guildId: string): Promise<Track | null> {
		try {
			const guildCache = this.getGuildTracks(guildId);
			if (guildCache?.size) {
				const firstEntry = guildCache.entries().next();
				if (!firstEntry.done) {
					const [trackId, track] = firstEntry.value;
					guildCache.delete(trackId);
					if (!guildCache.size) this.trackCache.delete(guildId);
					this.invalidateQueueCache(guildId);
					return track;
				}
			}
			return null;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_track", {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
			return null;
		}
	}

	async getTrackWithPriority(guildId: string): Promise<Track | null> {
		try {
			const guildCache = this.getGuildTracks(guildId);
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
				this.locale.t(
					"messages.cacheQueueService.errors.get_track_with_priority",
					{ guildId },
				),
				error instanceof Error ? error.message : String(error),
			);
			return null;
		}
	}

	async setTrack(guildId: string, track: Omit<Track, "id">): Promise<void> {
		try {
			this.clearWaveState(guildId);
			const validatedTrack = TrackSchema.parse(track) as Track;

			const guildCache =
				this.getGuildTracks(guildId) || new Map<string, Track>();
			guildCache.set(track.trackId, validatedTrack);
			this.trackCache.set(guildId, guildCache);
			this.invalidateQueueCache(guildId);

			if (track.source === "yandex") {
				this.setLastTrackID(guildId, track.trackId);
			}
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.set_track", {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	async setTracks(guildId: string, tracks: Omit<Track, "id">[]): Promise<void> {
		try {
			if (!tracks?.length) return;

			this.clearWaveState(guildId);
			const validatedTracks = tracks.map(
				(track) => TrackSchema.parse(track) as Track,
			);

			const guildCache =
				this.getGuildTracks(guildId) || new Map<string, Track>();

			for (const track of validatedTracks) {
				guildCache.set(track.trackId, track);
				if (track.source === "yandex") {
					this.setLastTrackID(guildId, track.trackId);
				}
			}

			this.trackCache.set(guildId, guildCache);
			this.invalidateQueueCache(guildId);
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.set_tracks", {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	async getQueue(guildId: string): Promise<EnhancedQueueResult> {
		try {
			const cachedQueue = this.queueCache.get(guildId);
			if (cachedQueue) return cachedQueue;

			const tracks = Array.from(this.getGuildTracks(guildId)?.values() || []);
			const result: EnhancedQueueResult = {
				tracks,
				lastTrackId: this.getLastTrackID(guildId) ?? undefined,
				lastTrack: this.getLastTrack(guildId) ?? undefined,
				waveStatus: this.getWave(guildId),
				volume: this.getVolume(guildId),
				loop: this.getLoop(guildId),
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
				lastTrack: undefined,
				waveStatus: false,
				volume: CacheQueueService.DEFAULT_VOLUME,
				loop: false,
			};
		}
	}

	async getQueueLength(guildId: string): Promise<number> {
		try {
			const cachedQueue = this.queueCache.get(guildId);
			if (cachedQueue) return cachedQueue.tracks.length;

			return this.getGuildTracks(guildId)?.size || 0;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.get_queue_length", {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
			return 0;
		}
	}

	async shuffleTracks(guildId: string): Promise<number> {
		try {
			const guildCache = this.getGuildTracks(guildId);
			if (!guildCache || guildCache.size <= 1) return 0;

			const entries = Array.from(guildCache.entries());

			for (let i = entries.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[entries[i], entries[j]] = [entries[j], entries[i]];
			}

			guildCache.clear();
			entries.forEach(([id, track]) => guildCache.set(id, track));
			this.invalidateQueueCache(guildId);

			return entries.length;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.shuffle_tracks", {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
			return 0;
		}
	}

	private getMetaData<T>(guildId: string, key: string, defaultValue: T): T {
		const cachedQueue = this.queueCache.get(guildId);
		if (cachedQueue && key in cachedQueue) {
			return (cachedQueue as any)[key] ?? defaultValue;
		}
		return this.metaCache.get(`${key}:${guildId}`) ?? defaultValue;
	}

	private setMetaData(guildId: string, key: string, value: any): void {
		this.metaCache.set(`${key}:${guildId}`, value);
		const queueData = this.queueCache.get(guildId);
		if (queueData) {
			(queueData as any)[key] = value;
			this.queueCache.set(guildId, queueData);
		}
	}

	getLastTrack(guildId: string): Track | null {
		return this.getMetaData(guildId, "lastTrack", null);
	}

	setLastTrack(guildId: string, track?: Track): void {
		this.setMetaData(guildId, "lastTrack", track || null);
	}

	getLastTrackID(guildId: string): string | null {
		return this.getMetaData(guildId, "lastTrackId", null);
	}

	setLastTrackID(guildId: string, trackId?: string): void {
		this.setMetaData(guildId, "lastTrackId", trackId || null);
	}

	getLoop(guildId: string): boolean {
		return this.getMetaData(guildId, "loop", false);
	}

	setLoop(guildId: string, loop: boolean): void {
		this.setMetaData(guildId, "loop", loop);
	}

	getWave(guildId: string): boolean {
		return this.getMetaData(guildId, "waveStatus", false);
	}

	setWave(guildId: string, wave: boolean): void {
		this.setMetaData(guildId, "waveStatus", wave);
		if (!wave) this.clearWaveState(guildId);
	}

	getVolume(guildId: string): number {
		return this.getMetaData(
			guildId,
			"volume",
			CacheQueueService.DEFAULT_VOLUME,
		);
	}

	setVolume(guildId: string, volume: number): void {
		this.setMetaData(guildId, "volume", Number(volume));
	}

	clearWaveState(guildId: string): void {
		["waveSeed", "wavePos"].forEach((key) =>
			this.metaCache.delete(`${key}:${guildId}`),
		);
	}

	countMusicTracks(guildId: string): number {
		return this.getGuildTracks(guildId)?.size || 0;
	}

	async removeTrack(guildId: string, trackId: string): Promise<void> {
		try {
			const guildCache = this.getGuildTracks(guildId);
			if (guildCache) {
				guildCache.delete(trackId);
				if (guildCache.size === 0) this.trackCache.delete(guildId);
				this.invalidateQueueCache(guildId);
			}
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.remove_track", {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	async clearQueue(guildId: string): Promise<void> {
		try {
			this.trackCache.delete(guildId);
			this.queueCache.delete(guildId);
			[
				"lastTrack",
				"lastTrackId",
				"loop",
				"waveStatus",
				"volume",
				"waveSeed",
				"wavePos",
			].forEach((key) => this.metaCache.delete(`${key}:${guildId}`));
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.clear_queue", {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	async peekTrack(guildId: string): Promise<Track | null> {
		try {
			const guildCache = this.getGuildTracks(guildId);
			if (guildCache?.size) {
				const firstEntry = guildCache.entries().next();
				if (!firstEntry.done) {
					return firstEntry.value[1];
				}
			}
			return null;
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.cacheQueueService.errors.peek_track", {
					guildId,
				}),
				error instanceof Error ? error.message : String(error),
			);
			return null;
		}
	}

	clearGuildCache(guildId: string): void {
		this.trackCache.delete(guildId);
		this.queueCache.delete(guildId);
		["lastTrack", "lastTrackId", "loop", "waveStatus", "volume"].forEach(
			(key) => this.metaCache.delete(`${key}:${guildId}`),
		);
	}

	clearAllCache(): void {
		this.trackCache.clear();
		this.queueCache.clear();
		this.metaCache.clear();
	}

	private invalidateQueueCache(guildId: string): void {
		this.queueCache.delete(guildId);
	}

	async logTrackPlay(): Promise<void> {
		// Placeholder for logging functionality
	}

	async getLastPlayedTracks(): Promise<Track[]> {
		return [];
	}

	async getTopPlayedTracks(): Promise<Track[]> {
		return [];
	}

	private getGuildTracks(guildId: string): Map<string, Track> | undefined {
		return this.trackCache.get(guildId);
	}
}
