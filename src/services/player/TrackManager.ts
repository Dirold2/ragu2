import type { Logger } from "dlog2";
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
  getActivePlugins(): readonly MusicServicePlugin[];
}

export interface ResolvedPlayback {
  url: string;
  source: string;
  trackId: string;
  fallback: boolean;
}

interface CachedFallback {
  source: string;
  trackId: string;
  cachedAt: number;
}

export class TrackManager {
  private readonly durationCache = new Map<string, { value: number; cachedAt: number }>();
  private readonly fallbackCache = new Map<string, CachedFallback>();
  private readonly CACHE_TTL = 3600000;
  private readonly fallbackSources = ["yandex", "hitmos"];
  private readonly fallbackMatchThreshold = 80;
  private readonly fallbackDurationToleranceMs = 3000;

  constructor(
    private readonly logger: Logger,
    private readonly pluginManager: PluginManagerSubset,
    private readonly t: (
      key: string,
      params?: Record<string, unknown>,
      lang?: string | boolean,
    ) => string,
  ) {}

  /**
   * Resolves the actual audio source while retaining the original track metadata.
   */
  async resolvePlayback(track: Track): Promise<ResolvedPlayback | null> {
    const sourcePlugin = this.pluginManager.getPlugin(track.source);
    const directUrl =
      sourcePlugin?.supportsPlayback === false
        ? null
        : await this.getTrackUrl(track.trackId, track.source);
    if (directUrl) {
      return {
        url: directUrl,
        source: track.source,
        trackId: track.trackId,
        fallback: false,
      };
    }

    if (track.source === "url") return null;

    const cacheKey = `${track.source}:${track.trackId}`;
    const cachedFallback = this.fallbackCache.get(cacheKey);
    if (cachedFallback && Date.now() - cachedFallback.cachedAt < this.CACHE_TTL) {
      const cachedUrl = await this.getTrackUrl(cachedFallback.trackId, cachedFallback.source);
      if (cachedUrl) {
        return { url: cachedUrl, ...cachedFallback, fallback: true };
      }
      this.fallbackCache.delete(cacheKey);
    }

    const { title, artists } = this.getTrackMetadata(track);
    if (!title) {
      this.logger?.warn?.(
        `TrackManager: Cannot find a fallback for ${track.source}:${track.trackId} without a title`,
      );
      return null;
    }

    const query = [...artists, title].filter(Boolean).join(" - ");
    const matchThreshold = this.getFallbackMatchThreshold(artists, track.durationMs);
    const plugins = this.getFallbackPlugins(track.source);
    const searchResults = await Promise.all(
      plugins.map(async (plugin) => {
        try {
          return { plugin, candidates: await plugin.searchName(query) };
        } catch (error) {
          this.logger?.debug?.(
            `TrackManager: Fallback search via ${plugin.name} failed: ${(error as Error).message}`,
          );
          return { plugin, candidates: [] };
        }
      }),
    );

    const matches = searchResults.flatMap(({ plugin, candidates }, sourceOrder) => {
      const sourceMatches = candidates
        .map((candidate) => ({
          plugin,
          candidate,
          score: this.scoreCandidate(title, artists, track.durationMs, candidate),
          sourceOrder,
        }))
        .filter(({ score }) => score >= matchThreshold)
        .sort((left, right) => right.score - left.score);
      this.logger?.debug?.(
        `TrackManager: Fallback ${plugin.name} search returned ${candidates.length} candidates; ${sourceMatches.length} matched`,
      );
      return sourceMatches;
    });

    for (const { plugin, candidate, score } of matches.sort(
      (left, right) => left.sourceOrder - right.sourceOrder || right.score - left.score,
    )) {
      const url = await this.getTrackUrl(candidate.id, plugin.name);
      if (!url) continue;

      this.fallbackCache.set(cacheKey, {
        source: plugin.name,
        trackId: candidate.id,
        cachedAt: Date.now(),
      });
      this.logger?.debug?.(
        `TrackManager: Resolved ${track.source}:${track.trackId} through ${plugin.name}:${candidate.id} (score ${score})`,
      );
      return { url, source: plugin.name, trackId: candidate.id, fallback: true };
    }

    this.logger?.debug?.(
      `TrackManager: No fallback match for ${track.source}:${track.trackId} (query: ${query})`,
    );
    return null;
  }

  /**
   * Gets track URL dynamically with validation.
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

      const plugin = this.pluginManager.getPlugin(source);
      if (!plugin?.getTrackUrl) {
        this.logger?.error?.(
          this.t("messages.playerService.player.error.plugin_not_found", { source }) ||
            `Plugin not found: ${source}`,
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
   * Gets track duration in milliseconds with caching.
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
   * Gets recommendations for a track with type safety.
   */
  async getRecommendations(trackId: string, sessionKey?: string): Promise<Track[]> {
    if (!trackId?.trim()) return [];

    try {
      const plugin = this.pluginManager.getPlugin("yandex");
      if (!plugin?.getRecommendations) return [];

      const rawRecommendations = await plugin.getRecommendations(trackId, sessionKey);
      if (!Array.isArray(rawRecommendations)) return [];

      return rawRecommendations
        .filter((rec): rec is RecommendationRaw => this.isValidRecommendation(rec))
        .map((rec) => ({
          trackId: rec.id,
          info: this.formatTrackInfo(rec),
          title: rec.title,
          artists: rec.artists.map((artist) => artist.name),
          source: rec.source,
          priority: false,
          durationMs: Math.max(0, rec.durationMs),
          generation: rec.generation,
        }));
    } catch (error) {
      this.logger?.error?.(
        `TrackManager: Failed to get recommendations for ${trackId}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  clearCache(): void {
    this.durationCache.clear();
    this.fallbackCache.clear();
  }

  private getFallbackPlugins(source: string): MusicServicePlugin[] {
    return [...this.pluginManager.getActivePlugins()]
      .filter((plugin) => plugin.name !== source && plugin.name !== "url")
      .sort((left, right) => {
        const leftIndex = this.fallbackSources.indexOf(left.name);
        const rightIndex = this.fallbackSources.indexOf(right.name);
        const leftPriority = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const rightPriority = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        return leftPriority - rightPriority || left.name.localeCompare(right.name);
      });
  }

  private getTrackMetadata(track: Track): { title: string; artists: string[] } {
    if (track.title?.trim()) {
      return { title: track.title.trim(), artists: track.artists ?? [] };
    }

    const separatorIndex = track.info.lastIndexOf(" - ");
    if (separatorIndex === -1) return { title: track.info.trim(), artists: [] };

    return {
      artists: track.info
        .slice(0, separatorIndex)
        .split(",")
        .map((artist) => artist.trim())
        .filter(Boolean),
      title: track.info.slice(separatorIndex + 3).trim(),
    };
  }

  private getFallbackMatchThreshold(artists: string[], durationMs: number | undefined): number {
    return artists.length > 0 || durationMs ? this.fallbackMatchThreshold : 60;
  }

  private scoreCandidate(
    title: string,
    artists: string[],
    durationMs: number | undefined,
    candidate: import("../../types/index.js").SearchTrackResult,
  ): number {
    const normalizedTitle = this.normalize(title);
    const normalizedCandidateTitle = this.normalize(candidate.title);
    let score = 0;

    if (normalizedTitle === normalizedCandidateTitle) score += 60;
    else if (
      normalizedTitle.includes(normalizedCandidateTitle) ||
      normalizedCandidateTitle.includes(normalizedTitle)
    ) {
      score += 45;
    }

    const hasArtistMatch = artists.some((artist) =>
      candidate.artists.some((candidateArtist) => {
        const normalizedArtist = this.normalize(artist);
        const normalizedCandidateArtist = this.normalize(candidateArtist.name);
        return (
          normalizedArtist.length >= 3 &&
          normalizedCandidateArtist.length >= 3 &&
          (normalizedArtist.includes(normalizedCandidateArtist) ||
            normalizedCandidateArtist.includes(normalizedArtist))
        );
      }),
    );
    if (hasArtistMatch) score += 30;

    if (durationMs && candidate.durationMs) {
      const difference = Math.abs(durationMs - candidate.durationMs);
      if (difference <= this.fallbackDurationToleranceMs) score += 10;
      else if (difference <= this.fallbackDurationToleranceMs * 2) score += 5;
    }

    return score;
  }

  private normalize(value: string): string {
    return value
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidRecommendation(rec: unknown): rec is RecommendationRaw {
    if (typeof rec !== "object" || rec === null) return false;
    const value = rec as RecommendationRaw;
    return (
      typeof value.id === "string" &&
      typeof value.title === "string" &&
      Array.isArray(value.artists) &&
      typeof value.source === "string" &&
      typeof value.durationMs === "number" &&
      typeof value.generation === "boolean"
    );
  }

  private formatTrackInfo(rec: RecommendationRaw): string {
    const artists = rec.artists
      .map((artist) => artist?.name)
      .filter(Boolean)
      .join(", ");
    return artists ? `${artists} - ${rec.title}` : rec.title;
  }
}
