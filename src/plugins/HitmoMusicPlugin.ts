import createLogger from "dlog2";
import type { MusicServicePlugin } from "../interfaces/index.js";
import type { SearchTrackResult } from "../types/index.js";
import { HITApi } from "hitd2";
import { CacheManager } from "hcacher";
import { getErrorMessage } from "../utils/error.js";

export default class HitmoMusicPlugin implements MusicServicePlugin {
  name = "hitmos";
  urlPatterns = [/(?:^|\.)hitmos\.(?:me|fm)(?:\/|$)/, /(?:^|\.)hitmoz\.org(?:\/|$)/];

  private static readonly UNAVAILABLE_TRACK_TTL = 2 * 60_000;

  private api: HITApi;
  private readonly sourceUrls = new Map<string, string>();
  private readonly unavailableTracks = new CacheManager<true>({
    maxSize: 500,
    ttl: HitmoMusicPlugin.UNAVAILABLE_TRACK_TTL,
  });
  public logger = createLogger(this.name);

  constructor(sessionCookie?: string) {
    this.api = new HITApi({ sessionCookie });
  }

  async initialize() {
    this.logger.info(`Plugin ${this.name} Initialized`);
  }

  /**
   * Поиск трека по названию.
   * Возвращает массив результатов поиска в общем формате SearchTrackResult.
   */
  async searchName(trackName: string): Promise<SearchTrackResult[]> {
    try {
      const tracks = await this.api.search(trackName, 10);

      return tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artists: [{ name: track.artist || "Unknown" }],
        albums: undefined,
        durationMs: track.duration > 0 ? track.duration * 1000 : undefined,
        cover: undefined,
        source: this.name,
        url: undefined,
        generation: false,
      }));
    } catch (error) {
      console.error(`[Plugin:${this.name}] Search failed for "${trackName}":`, error);
      return [];
    }
  }

  async searchURL(url: string): Promise<SearchTrackResult[]> {
    try {
      const sourceUrl = new URL(url).toString();
      const meta = await this.api.getTrackByUrl(sourceUrl);

      this.sourceUrls.set(meta.id, sourceUrl);

      return [
        {
          id: meta.id,
          title: meta.title,
          artists: [{ name: meta.artist || "Unknown" }],
          albums: undefined,
          durationMs: meta.duration > 0 ? meta.duration * 1000 : undefined,
          cover: meta.image,
          source: this.name,
          url: sourceUrl,
          generation: false,
        },
      ];
    } catch (error) {
      console.error(`[Plugin:${this.name}] URL processing failed for "${url}":`, error);
      return [];
    }
  }

  async getTrackUrl(trackId: string): Promise<string> {
    if (this.unavailableTracks.get(trackId)) {
      throw new Error(`Track ${trackId} is temporarily marked unavailable by Hitmo`);
    }

    const sourceUrl = this.sourceUrls.get(trackId);

    try {
      this.logger.debug(`[Hitmo] Resolving ${trackId}; source URL: ${sourceUrl ?? "<missing>"}`);

      const audio = sourceUrl
        ? await this.api.getAudioByUrl(sourceUrl)
        : await this.api.getAudio(trackId);

      if (!audio.url) {
        throw new Error("Audio URL is empty");
      }

      return audio.url;
    } catch (error) {
      this.sourceUrls.delete(trackId);
      this.unavailableTracks.set(trackId, true);

      this.logger.warn(
        `[Hitmo] Track ${trackId} is unavailable or has no playable URL; caching failure for 2 minutes: ${getErrorMessage(error)}`,
      );

      throw error;
    }
  }
}
