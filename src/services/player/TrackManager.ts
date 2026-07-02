import type { Logger } from "dlog2";
import EventEmitter from "events";
import type { Track } from "../../types/index.js";
import type { MusicServicePlugin } from "../../interfaces/index.js";
import { getAudioDurationInSeconds } from "get-audio-duration";

interface RecommendationRaw {
  id: string;
  title: string;
  artists: Array<{ name: string }>;
  source: string;
  durationMs: number;
  generation: boolean;
}

interface PluginManagerSubset {
  getPlugin(name: string): MusicServicePlugin | undefined;
}

export class TrackManager extends EventEmitter {
  private readonly durationCache = new Map<string, { value: number; cachedAt: number }>();
  private readonly CACHE_TTL = 3600000;

  constructor(
    private readonly logger: Logger,
    private readonly pluginManager: PluginManagerSubset,
    private readonly t: (
      key: string,
      params?: Record<string, unknown>,
      lang?: string | boolean,
    ) => string,
  ) {
    super();
  }

  /**
   * Gets track URL dynamically with caching and validation
   */
  async getTrackUrl(trackId: string, source: string): Promise<string | null> {
    try {
      if (!trackId?.trim()) {
        this.logger?.warn?.("TrackManager: Empty trackId provided");
        return null;
      }

      if (source === "url") {
        return this.isValidUrl(trackId) ? trackId : null;
      }

      const plugin = this.pluginManager?.getPlugin(source);
      if (!plugin?.getTrackUrl) {
        this.logger?.error?.(
          this.t("messages.playerService.player.error.plugin_not_found", {
            source,
          }) || `Plugin not found: ${source}`,
        );
        return null;
      }

      const url = await plugin.getTrackUrl(trackId);
      if (!url?.trim()) {
        this.logger?.warn?.(`TrackManager: Plugin returned empty URL for trackId: ${trackId}`);
        return null;
      }

      return url;
    } catch (error) {
      this.logger?.error?.(
        this.t("messages.playerService.player.error.get_track_url", {
          trackId,
          error: (error as Error).message,
        }) || `Failed to get track URL: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Gets track duration in milliseconds with caching
   */
  async getDuration(url: string): Promise<number> {
    if (!url?.trim()) return 0;

    const cached = this.durationCache.get(url);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      return cached.value;
    }

    try {
      const durationInSeconds = await getAudioDurationInSeconds(
        url,
        process.env.FFPROBE_PATH || undefined,
      );

      if (typeof durationInSeconds !== "number" || durationInSeconds < 0) {
        return 0;
      }

      const durationMs = Math.round(durationInSeconds * 1000);
      this.durationCache.set(url, { value: durationMs, cachedAt: Date.now() });
      return durationMs;
    } catch (error) {
      this.logger?.debug?.(
        `TrackManager: Failed to get duration for ${url}: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Gets recommendations for a track with type safety
   */
  async getRecommendations(trackId: string): Promise<Track[]> {
    if (!trackId?.trim()) return [];

    try {
      const plugin = this.pluginManager?.getPlugin("yandex");
      if (!plugin?.getRecommendations) {
        return [];
      }

      const rawRecommendations = await plugin.getRecommendations(trackId);
      if (!Array.isArray(rawRecommendations)) {
        return [];
      }

      const recommendations: Track[] = rawRecommendations
        .filter((rec): rec is RecommendationRaw => this.isValidRecommendation(rec))
        .map((rec) => ({
          trackId: rec.id,
          info: this.formatTrackInfo(rec),
          source: rec.source,
          priority: false,
          durationMs: Math.max(0, rec.durationMs),
          generation: rec.generation,
        }));

      return recommendations;
    } catch (error) {
      this.logger?.error?.(
        `TrackManager: Failed to get recommendations for ${trackId}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Validates URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validates recommendation object
   */
  private isValidRecommendation(rec: any): rec is RecommendationRaw {
    return (
      typeof rec?.id === "string" &&
      typeof rec?.title === "string" &&
      Array.isArray(rec?.artists) &&
      typeof rec?.source === "string" &&
      typeof rec?.durationMs === "number" &&
      typeof rec?.generation === "boolean"
    );
  }

  /**
   * Formats track info from recommendation
   */
  private formatTrackInfo(rec: RecommendationRaw): string {
    const artists = Array.isArray(rec.artists)
      ? rec.artists
          .map((a) => a?.name)
          .filter(Boolean)
          .join(", ")
      : "";
    return artists ? `${rec.title} - ${artists}` : rec.title;
  }

  /**
   * Clears duration cache
   */
  clearCache(): void {
    this.durationCache.clear();
  }
}
