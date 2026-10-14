import type { Logger } from "dlog2";
import { randomUUID } from "node:crypto";
import { type Track, TrackSchema } from "../../types/index.js";
import type { QueueResult } from "../../interfaces/index.js";
import { CacheManager } from "hcacher";
import { getErrorMessage } from "../../utils/error.js";
import config from "../../../config.json" with { type: "json" };

interface EnhancedQueueResult extends QueueResult {
  loop?: boolean;
  _timestamp?: number;
}

export interface QueueEntry {
  id: string;
  track: Track;
}

export default class CacheQueueService {
  private static readonly DEFAULT_VOLUME = config.audio.volume.default * 100 || 20;
  private static readonly CACHE_TTL = 60000;

  private readonly trackCache = new Map<string, Map<string, Track>>();
  private readonly queueCache: CacheManager<EnhancedQueueResult>;
  private readonly metaCache: CacheManager<any>;

  // Wave is user-controlled playback state, so it must not expire with metadata cache entries.
  private readonly waveStatusByGuild = new Map<string, boolean>();
  private readonly waveSeedByGuild = new Map<string, Track | null>();

  constructor(
    private readonly logger: Logger,
    private readonly locale: {
      t(key: string, params?: Record<string, unknown>, lang?: string | boolean): string;
    },
    ttl = 3600,
  ) {
    this.queueCache = new CacheManager<EnhancedQueueResult>({
      maxSize: 1000,
      ttl: CacheQueueService.CACHE_TTL,
    });

    this.metaCache = new CacheManager<any>({
      maxSize: 5000,
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
        `${this.locale.t("messages.cacheQueueService.errors.get_track", {
          guildId,
        })}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async setTrack(guildId: string, track: Track): Promise<void> {
    try {
      const validatedTrack = TrackSchema.parse(track) as Track;
      const guildCache = this.getGuildTracks(guildId) || new Map<string, Track>();

      if (validatedTrack.priority) {
        const existingEntries = Array.from(guildCache.entries());
        guildCache.clear();
        guildCache.set(randomUUID(), validatedTrack);
        for (const [key, existingTrack] of existingEntries) {
          guildCache.set(key, existingTrack);
        }
      } else {
        guildCache.set(randomUUID(), validatedTrack);
      }

      this.trackCache.set(guildId, guildCache);
      this.invalidateQueueCache(guildId);

      if (track.source === "yandex") {
        this.setLastTrackID(guildId, track.trackId);
      }
    } catch (error) {
      this.logger.error(
        `${this.locale.t("messages.cacheQueueService.errors.set_track", {
          guildId,
        })}: ${getErrorMessage(error)}`,
      );
    }
  }

  async setTracks(guildId: string, tracks: Track[]): Promise<void> {
    try {
      if (!tracks?.length) return;

      const validatedTracks = tracks.map((track) => TrackSchema.parse(track) as Track);

      const guildCache = this.getGuildTracks(guildId) || new Map<string, Track>();

      for (const track of validatedTracks) {
        guildCache.set(randomUUID(), track);
        if (track.source === "yandex") {
          this.setLastTrackID(guildId, track.trackId);
        }
      }

      this.trackCache.set(guildId, guildCache);
      this.invalidateQueueCache(guildId);
    } catch (error) {
      this.logger.error(
        `${this.locale.t("messages.cacheQueueService.errors.set_tracks", {
          guildId,
        })}: ${getErrorMessage(error)}`,
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
        `${this.locale.t("messages.cacheQueueService.errors.get_queue", {
          guildId,
        })}: ${getErrorMessage(error)}`,
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
        `${this.locale.t("messages.cacheQueueService.errors.get_queue_length", {
          guildId,
        })}: ${getErrorMessage(error)}`,
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
        `${this.locale.t("messages.cacheQueueService.errors.shuffle_tracks", {
          guildId,
        })}: ${getErrorMessage(error)}`,
      );
      return 0;
    }
  }

  private getMetaData<T>(guildId: string, key: string, defaultValue: T): T {
    return (this.metaCache.get(`${key}:${guildId}`) as T | undefined) ?? defaultValue;
  }

  private setMetaData(guildId: string, key: string, value: unknown): void {
    this.metaCache.set(`${key}:${guildId}`, value);
  }

  getLastTrack(guildId: string): Track | null {
    return this.waveSeedByGuild.get(guildId) ?? null;
  }

  setLastTrack(guildId: string, track?: Track): void {
    this.waveSeedByGuild.set(guildId, track ?? null);
    this.invalidateQueueCache(guildId);
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
    return this.waveStatusByGuild.get(guildId) ?? false;
  }

  setWave(guildId: string, wave: boolean): void {
    this.waveStatusByGuild.set(guildId, wave);
    this.invalidateQueueCache(guildId);
  }

  getVolume(guildId: string): number {
    return this.getMetaData(guildId, "volume", CacheQueueService.DEFAULT_VOLUME);
  }

  setVolume(guildId: string, volume: number): void {
    this.setMetaData(guildId, "volume", Number(volume));
  }

  getQueueEntries(guildId: string): QueueEntry[] {
    return Array.from(this.getGuildTracks(guildId)?.entries() ?? []).map(([id, track]) => ({
      id,
      track,
    }));
  }

  async removeQueueEntry(guildId: string, entryId: string): Promise<Track | null> {
    try {
      const guildCache = this.getGuildTracks(guildId);
      const track = guildCache?.get(entryId) ?? null;
      if (!guildCache || !track) return null;

      guildCache.delete(entryId);
      if (guildCache.size === 0) this.trackCache.delete(guildId);
      this.invalidateQueueCache(guildId);
      return track;
    } catch (error) {
      this.logger.error(
        `${this.locale.t("messages.cacheQueueService.errors.remove_track", {
          guildId,
        })}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async skipQueueTo(guildId: string, entryId: string): Promise<Track | null> {
    try {
      const guildCache = this.getGuildTracks(guildId);
      if (!guildCache) return null;

      const entries = Array.from(guildCache.entries());
      const targetIndex = entries.findIndex(([id]) => id === entryId);
      if (targetIndex < 0) return null;

      for (const [id] of entries.slice(0, targetIndex)) {
        guildCache.delete(id);
      }

      this.invalidateQueueCache(guildId);
      return entries[targetIndex][1];
    } catch (error) {
      this.logger.error(
        `${this.locale.t("messages.cacheQueueService.errors.remove_track", {
          guildId,
        })}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private getGuildTracks(guildId: string): Map<string, Track> | undefined {
    return this.trackCache.get(guildId);
  }

  async removeTrack(guildId: string, trackId: string): Promise<void> {
    try {
      const guildCache = this.getGuildTracks(guildId);
      if (guildCache) {
        const entry = Array.from(guildCache.entries()).find(
          ([, track]) => track.trackId === trackId,
        );
        if (entry) guildCache.delete(entry[0]);
        if (guildCache.size === 0) this.trackCache.delete(guildId);
        this.invalidateQueueCache(guildId);
      }
    } catch (error) {
      this.logger.error(
        `${this.locale.t("messages.cacheQueueService.errors.remove_track", {
          guildId,
        })}: ${getErrorMessage(error)}`,
      );
    }
  }

  async clearQueue(guildId: string): Promise<void> {
    try {
      this.trackCache.delete(guildId);
      this.queueCache.delete(guildId);
      this.invalidateQueueCache(guildId);
    } catch (error) {
      this.logger.error(
        `${this.locale.t("messages.cacheQueueService.errors.clear_queue", {
          guildId,
        })}: ${getErrorMessage(error)}`,
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
        `${this.locale.t("messages.cacheQueueService.errors.peek_track", {
          guildId,
        })}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private invalidateQueueCache(guildId: string): void {
    this.queueCache.delete(guildId);
  }
}
