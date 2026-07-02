import retry from "async-retry";
import { Discord } from "discordx";
import { URL } from "url";
import { Types, WrappedYMApi, YMApi } from "yamd2";
import type { MusicServicePlugin, PlaylistTrack } from "../interfaces/index.js";
import {
  type Config,
  ConfigSchema,
  type SearchTrackResult,
  TrackResultSchema,
} from "../types/index.js";
import { CacheManager } from "hcacher";
import { getErrorMessage } from "../utils/error.js";
import { bot } from "../bot.js";
import { Mutex } from "../utils/mutex.js";
import createLogger from "dlog2";

export interface TrackYandex {
  id: number | string;
  title: string;
  artists: readonly { name: string }[];
  albums: readonly { title?: string }[];
  durationMs: number | undefined;
  coverUri: string | undefined;
}

const CACHE_TTL = 600 * 1000;
const CACHE_CHECK_PERIOD = 120 * 1000;
const CACHE_MAX_SIZE = 1000;
const CACHE_CLEANUP_THRESHOLD = 800;

const RETRY_CONFIG = {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 5000,
} as const;

const URL_PATTERNS = {
  track: /\/album\/\d+\/track\/(\d+)/,
  trackRoot: /\/track\/(\d+)/,
  userPlaylist: /\/users\/([^/]+)\/playlists\/(\d+)/i,
  genericPlaylist: /\/playlists\/([a-z]+\.[a-f0-9-]+|[a-f0-9-]{36})/i,
  album: /\/album\/(\d+)(\?.*)?$/,
} as const;

function useCache(): boolean {
  const env = process.env.USE_CACHE?.toLowerCase();
  return env === "true" || env === undefined;
}

class RadioSessionManager {
  public logger = createLogger(`RadioSession`);
  private sessions = new Map<string, string>();
  private batchIds = new Map<string, string>();
  private trackIds = new Map<string, string[]>();
  private playedTracks = new Map<string, Set<string>>();
  private sessionPromises = new Map<string, Promise<string | null>>();

  async getOrCreateSession(
    trackId: string,
    api: YMApi,
  ): Promise<string | null> {
    if (this.sessions.has(trackId)) {
      return this.sessions.get(trackId)!;
    }

    if (this.sessionPromises.has(trackId)) {
      return this.sessionPromises.get(trackId)!;
    }

    const promise = api.radio
      .createRotorSession([`track:${trackId}`], false)
      .then((session: Types.RotorSessionCreateResponse) => {
        this.sessions.set(trackId, session.radioSessionId);
        this.batchIds.set(trackId, session.batchId);
        this.playedTracks.set(trackId, new Set());
        return session.radioSessionId;
      })
      .catch((err: Error) => {
        this.logger.warn(`[Yandex] Failed to create rotor session: ${err}`, {
          module: "Yandex",
        });
        return null;
      })
      .finally(() => {
        this.sessionPromises.delete(trackId);
      });

    this.sessionPromises.set(trackId, promise);
    return promise;
  }

  getBatchId(trackId: string): string | undefined {
    return this.batchIds.get(trackId);
  }

  getQueue(trackId: string): string[] {
    return this.trackIds.get(trackId) ?? [];
  }

  addToQueue(trackId: string, item: string): void {
    const queue = this.getQueue(trackId);
    queue.push(item);
    this.trackIds.set(trackId, queue);
  }

  getPlayedTracks(trackId: string): Set<string> {
    return this.playedTracks.get(trackId) ?? new Set();
  }

  markAsPlayed(trackId: string, track: string): void {
    const played = this.getPlayedTracks(trackId);
    played.add(track);
    this.playedTracks.set(trackId, played);
  }

  reset(trackId: string): void {
    this.sessions.delete(trackId);
    this.batchIds.delete(trackId);
    this.trackIds.delete(trackId);
    this.playedTracks.delete(trackId);
    this.sessionPromises.delete(trackId);
  }

  resetAll(): void {
    this.sessions.clear();
    this.sessionPromises.clear();
    this.batchIds.clear();
    this.trackIds.clear();
    this.playedTracks.clear();
  }
}

@Discord()
export default class YandexMusicPlugin implements MusicServicePlugin {
  name = "yandex";
  urlPatterns = [/music\.yandex\./];

  public logger = createLogger(this.name);
  private results: SearchTrackResult[] = [];
  private wrapper = new WrappedYMApi();
  private api = new YMApi();
  private cache: CacheManager<SearchTrackResult[]>;
  private initialized = false;
  private initMutex = new Mutex();
  private cacheCleanupInterval: NodeJS.Timeout | null = null;
  private radioManager = new RadioSessionManager();
  private recommendationsCache = new Map<string, SearchTrackResult[]>();
  private recommendationsPromises = new Map<
    string,
    Promise<SearchTrackResult[]>
  >();

  constructor() {
    this.cache = new CacheManager<SearchTrackResult[]>({
      enabled: useCache(),
      maxSize: CACHE_MAX_SIZE,
      ttl: CACHE_TTL,
    });
    this.startCacheCleanup();
  }

  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  hasAvailableResults = (): boolean => this.results.length > 0;

  getResults = (): SearchTrackResult[] => [...this.results];

  async includesUrl(url: string): Promise<boolean> {
    try {
      const parsed = new URL(url);
      return (
        URL_PATTERNS.genericPlaylist.test(parsed.pathname) ||
        URL_PATTERNS.userPlaylist.test(parsed.pathname) ||
        URL_PATTERNS.album.test(parsed.pathname)
      );
    } catch {
      return false;
    }
  }

  async searchName(trackName: string): Promise<SearchTrackResult[]> {
    await this.ensureInitialized();
    const cacheKey = `search_${trackName}`;
    const cachedResults = this.cache.get(cacheKey);

    if (cachedResults) {
      return cachedResults;
    }

    return await this.updateCacheInBackground(trackName, cacheKey);
  }

  async searchURL(url: string): Promise<SearchTrackResult[]> {
    await this.ensureInitialized();

    try {
      const parsedUrl = new URL(url);

      if (!this.isYandexMusicUrl(parsedUrl)) {
        return [];
      }

      if (URL_PATTERNS.album.test(parsedUrl.pathname)) {
        const albumId = this.extractId(parsedUrl, URL_PATTERNS.album);
        return albumId ? await this.getAlbumTracks(albumId) : [];
      }

      if (URL_PATTERNS.userPlaylist.test(parsedUrl.pathname)) {
        const match = parsedUrl.pathname.match(URL_PATTERNS.userPlaylist);
        if (match) {
          return await this.getPlaylistTracks(match[2], match[1]);
        }
      }

      if (URL_PATTERNS.genericPlaylist.test(parsedUrl.pathname)) {
        const match = parsedUrl.pathname.match(URL_PATTERNS.genericPlaylist);
        if (match) {
          return await this.getPlaylistTracks(match[1]);
        }
      }

      if (URL_PATTERNS.trackRoot.test(parsedUrl.pathname)) {
        return await this.processTrackFromUrl(
          parsedUrl,
          URL_PATTERNS.trackRoot,
        );
      }

      if (URL_PATTERNS.track.test(parsedUrl.pathname)) {
        return await this.processTrackFromUrl(parsedUrl, URL_PATTERNS.track);
      }

      return [];
    } catch (error) {
      this.logger.error(
        bot.locale.t("plugins.yandex.errors.url_processing", {
          plugin: this.name,
          error: (error as Error).message,
        }),
      );
      return [];
    }
  }

  getApiHeaders(_url: string): Record<string, string> {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Referer: "https://music.yandex.ru/",
    };
  }

  async getTrackUrl(trackId: string): Promise<string | null> {
    await this.ensureInitialized();

    if (!trackId) {
      this.logger.error("YandexMusicPlugin: trackId is empty");
      return null;
    }

    try {
      return await this.fetchTrackUrl(trackId);
    } catch (error) {
      this.logger.error(
        `${bot.locale.t("plugins.yandex.errors.get_track_url", {
          trackId,
          error: (error as Error).message,
        })}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async getRecommendations(trackId: string): Promise<SearchTrackResult[]> {
    await this.ensureInitialized();

    if (this.recommendationsPromises.has(trackId)) {
      this.logger.debug(
        `[Yandex] Waiting for in-progress recommendations for track:${trackId}`,
        {
          module: "Yandex",
        },
      );
      return this.recommendationsPromises.get(trackId)!;
    }

    const promise = this.fetchRecommendations(trackId);
    this.recommendationsPromises.set(trackId, promise);

    return promise;
  }

  async getPlaylistTracks(
    playlistId: string,
    user?: string,
  ): Promise<SearchTrackResult[]> {
    await this.ensureInitialized();

    try {
      const cacheKey = `playlist_${playlistId}_${user}`;
      const cachedResults = this.cache.get(cacheKey);
      if (cachedResults) return cachedResults;

      const playlistInfo = /^\d+$/.test(playlistId)
        ? await this.api.playlists.getPlaylist(Number(playlistId), user)
        : await this.api.playlists.getPlaylist(playlistId);

      if (!playlistInfo?.tracks) {
        this.logger.warn(
          bot.locale.t("plugins.yandex.errors.playlist.not_found"),
        );
        return [];
      }

      const results = this.processTrackList(
        playlistInfo.tracks as PlaylistTrack[],
      );
      this.cache.set(cacheKey, results);

      return results;
    } catch (error) {
      this.logger.error(
        `${bot.locale.t("plugins.yandex.errors.playlist.processing")}: ${getErrorMessage(error)}`,
      );
      return [];
    }
  }

  async getAlbumTracks(albumId: string): Promise<SearchTrackResult[]> {
    await this.ensureInitialized();

    try {
      const cacheKey = `album_${albumId}`;
      const cachedResults = this.cache.get(cacheKey);
      if (cachedResults) return cachedResults;

      const albumInfo = await this.api.albums.getAlbumWithTracks(
        Number(albumId),
      );
      const results = this.processTrackList(albumInfo.volumes.flat());

      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      this.logger.error(
        `${bot.locale.t("plugins.yandex.errors.track.processing")}: ${getErrorMessage(error)}`,
      );
      return [];
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.results = [];
  }

  resetRadioSession(): void {
    this.radioManager.resetAll();
    this.logger.info(`[Yandex] Radio sessions reset`, { module: "Yandex" });
  }

  async destroy(): Promise<void> {
    this.results = [];
    this.cache.clear();
    this.initialized = false;

    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
  }

  private isYandexMusicUrl(parsedUrl: URL): boolean {
    return (
      parsedUrl.hostname.endsWith("music.yandex.ru") ||
      parsedUrl.hostname.includes("music.yandex")
    );
  }

  private async fetchTrackUrl(trackId: string): Promise<string | null> {
    try {
      return await retry(
        () =>
          this.wrapper.getDownloadUrl(Number(trackId), {
            codec: Types.DownloadTrackCodec.MP3,
            quality: Types.DownloadTrackQuality.Lossless,
            forceRaw: false,
          }),
        RETRY_CONFIG,
      );
    } catch {
      return null;
    }
  }

  private async fetchRecommendations(
    trackId: string,
  ): Promise<SearchTrackResult[]> {
    try {
      const results = await this.fetchStationTracks(trackId, true);

      if (results.length > 0) {
        this.recommendationsCache.set(trackId, results);
      }

      return results;
    } catch (e) {
      this.logger.warn(
        `[Yandex] Error fetching recommendations for trackId:${trackId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      this.radioManager.reset(trackId);
      return [];
    } finally {
      this.recommendationsPromises.delete(trackId);
    }
  }

  private async fetchStationTracks(
    trackId: string,
    retry: boolean,
  ): Promise<SearchTrackResult[]> {
    const sessionId = await this.radioManager.getOrCreateSession(
      trackId,
      this.api,
    );

    if (!sessionId) {
      this.logger.warn(`[Yandex] No valid sessionId for track:${trackId}`, {
        module: "Yandex",
      });
      return [];
    }

    try {
      const st = await this.api.radio.postRotorSessionTracks(sessionId, {
        batchId: this.radioManager.getBatchId(trackId),
        queue: this.radioManager.getQueue(trackId),
      });

      return this.processStationTracks(trackId, st.sequence ?? []);
    } catch (err: any) {
      if (retry && err?.response?.status === 400) {
        this.logger.warn(
          `[Yandex] sessionId=${sessionId} invalid, regenerating for track:${trackId}`,
          { module: "Yandex" },
        );
        this.radioManager.reset(trackId);
        return this.fetchStationTracks(trackId, false);
      }
      return [];
    }
  }

  private processStationTracks(
    trackId: string,
    sequence: any[],
  ): SearchTrackResult[] {
    const collected: SearchTrackResult[] = [];

    for (const item of sequence) {
      if (!item.track) continue;

      const t = item.track;
      const trackIdStr = String(t.id);
      const trackAlbumIdStr = String(t.albums[0].id);

      const result = this.validateTrackResult({
        id: trackIdStr,
        title: t.title,
        artists: t.artists.map((a: any) => ({ name: a.name })),
        durationMs: t.durationMs,
        source: "yandex",
        generation: true,
      });

      if (result) {
        collected.push(result);
        this.radioManager.markAsPlayed(
          trackId,
          `${trackIdStr}:${trackAlbumIdStr}`,
        );
        this.radioManager.addToQueue(trackId, `${result.id}:${result.id}`);

        this.logger.debug(`[Yandex] Added track: ${trackIdStr} - ${t.title}`, {
          module: "Yandex",
        });
      }

      if (collected.length >= 1) break;
    }

    return collected;
  }

  private processTrackList(
    tracks: (PlaylistTrack | TrackYandex)[],
  ): SearchTrackResult[] {
    return tracks
      .map((track) => {
        const t = "track" in track ? track.track : track;
        return this.formatTrackInfo({
          id: t.id,
          title: t.title,
          artists: t.artists,
          albums: t.albums,
          durationMs: t.durationMs,
          coverUri: t.coverUri,
        });
      })
      .map((track) => this.validateTrackResult(track))
      .filter((t): t is SearchTrackResult => t !== null);
  }

  private async processTrackFromUrl(
    parsedUrl: URL,
    pattern: RegExp,
  ): Promise<SearchTrackResult[]> {
    const trackId = this.extractId(parsedUrl, pattern);
    if (!trackId) return [];

    try {
      const [trackInfo] = await this.api.tracks.getTrack(Number(trackId));
      if (!trackInfo) return [];

      const formatted = this.formatTrackInfo({
        id: trackInfo.id,
        title: trackInfo.title,
        artists: trackInfo.artists,
        albums: trackInfo.albums,
        durationMs: trackInfo.durationMs,
        coverUri: trackInfo.coverUri,
      });

      const validated = this.validateTrackResult(formatted);
      return validated ? [validated] : [];
    } catch (error) {
      this.logger.error(
        `Error processing track ${trackId}: ${getErrorMessage(error)}`,
      );
      return [];
    }
  }

  private extractId(parsedUrl: URL, pattern: RegExp): string | null {
    const match = parsedUrl.pathname.match(pattern);
    return match?.[1] ?? null;
  }

  private formatTrackInfo(
    trackInfo: TrackYandex,
    generation = false,
  ): SearchTrackResult {
    return {
      id: trackInfo.id.toString(),
      title: trackInfo.title,
      artists: trackInfo.artists.map((artist) => ({ name: artist.name })),
      albums: trackInfo.albums.map((album) => ({ title: album.title })),
      durationMs: trackInfo.durationMs ?? 0,
      cover: trackInfo.coverUri || "",
      source: "yandex",
      generation,
    };
  }

  private validateTrackResult(
    searchResult: SearchTrackResult,
  ): SearchTrackResult | null {
    const validation = TrackResultSchema.safeParse(searchResult);

    if (!validation.success) {
      this.logger.warn(
        bot.locale.t("plugins.yandex.errors.track.invalid_data", {
          error: JSON.stringify(validation.error),
        }),
      );
      return null;
    }

    return validation.data;
  }

  private loadConfig(): Config {
    const access_token = process.env.YM_API_KEY;
    const uid = Number(process.env.YM_USER_ID);
    const username = process.env.YM_USER_NAME;
    const password = process.env.YM_USER_PASSWORD;

    if (!access_token || isNaN(uid)) {
      throw new Error(
        bot.locale.t("plugins.yandex.errors.plugin.missing_config"),
      );
    }

    const config: any =
      username || password
        ? { access_token, uid, username, password }
        : { access_token, uid };

    const validation = ConfigSchema.safeParse(config);

    if (!validation.success) {
      throw new Error(
        bot.locale.t("plugins.yandex.errors.plugin.invalid_config", {
          errors: validation.error.issues
            .map((err: { message: string }) => err.message)
            .join(", "),
        }),
      );
    }

    return validation.data;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const release = await this.initMutex.acquire();
    try {
      if (this.initialized) return;

      const config = this.loadConfig();
      await Promise.all([this.wrapper.init(config), this.api.init(config)]);
      this.initialized = true;
    } catch (error) {
      this.logger.error(
        `${bot.locale.t("plugins.yandex.errors.error_initializing_service")}: ${getErrorMessage(error)}`,
      );
      throw new Error(
        bot.locale.t("plugins.yandex.errors.failed_to_initialize"),
      );
    } finally {
      release();
    }
  }

  private async updateCacheInBackground(
    trackName: string,
    cacheKey: string,
  ): Promise<SearchTrackResult[]> {
    try {
      const result = await retry(() => this.api.search.tracks(trackName), {
        retries: RETRY_CONFIG.retries,
        onRetry: (error: Error) =>
          this.logger.warn(
            `${bot.locale.t("plugins.yandex.errors.retrying_search", {
              trackName,
            })}: ${error.message}`,
          ),
      });

      if (!result?.tracks?.results) return [];

      const validatedTracks = this.processTrackList(result.tracks.results);

      if (validatedTracks.length > 0) {
        this.cache.set(cacheKey, validatedTracks);
        this.results = validatedTracks;
      }

      return validatedTracks;
    } catch (error) {
      this.logger.warn(
        bot.locale.t("plugins.yandex.errors.track.search", {
          query: trackName,
          error: getErrorMessage(error),
        }),
      );
      return [];
    }
  }

  private startCacheCleanup(): void {
    if (!useCache()) return;

    this.cacheCleanupInterval = setInterval(() => {
      if (this.cache.size > CACHE_CLEANUP_THRESHOLD) {
        this.cache.clear();
      }
    }, CACHE_CHECK_PERIOD);
  }
}
