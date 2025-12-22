import retry from "async-retry";
import { Discord } from "discordx";
import { LRUCache } from "lru-cache";
import { URL } from "url";
import {
	Types,
	WrappedYMApi,
	YMApi,
} from "ym-api-meowed-d2";
import type { MusicServicePlugin, PlaylistTrack } from "../interfaces/index.js";
import {
	type Config,
	ConfigSchema,
	type SearchTrackResult,
	TrackResultSchema,
} from "../types/index.js";
import { bot } from "../bot.js";

export interface TrackYandex {
	id: number | string;
	title: string;
	artists: readonly { name: string }[];
	albums: readonly { title?: string }[];
	durationMs: number | undefined;
	coverUri: string | undefined;
}

// ============================================
// Constants
// ============================================

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

// ============================================
// URL Patterns
// ============================================

const URL_PATTERNS = {
	track: /\/album\/\d+\/track\/(\d+)/,
	trackRoot: /\/track\/(\d+)/,
	userPlaylist: /\/users\/([^/]+)\/playlists\/(\d+)/i,
	genericPlaylist: /\/playlists\/([a-z]+\.[a-f0-9-]+|[a-f0-9-]{36})/i,
	album: /\/album\/(\d+)(\?.*)?$/,
} as const;

// ============================================
// Helper Classes
// ============================================

/** Simple mutex for preventing parallel initialization */
class Mutex {
	private locked = false;

	async acquire(): Promise<() => void> {
		while (this.locked) {
			await new Promise((r) => setTimeout(r, 10));
		}
		this.locked = true;
		return () => {
			this.locked = false;
		};
	}
}

/** Cache wrapper with conditional enabling */
class CacheWrapper<T extends {} = any> {
	private cache: LRUCache<string, T> | null = null;
	private readonly useCache: boolean;

	constructor(options?: Partial<LRUCache.Options<string, T, unknown>>) {
		const env = process.env.USE_CACHE?.toLowerCase();
		this.useCache = env === "true" || env === undefined;

		if (this.useCache) {
			this.cache = new LRUCache({
				max: CACHE_MAX_SIZE,
				ttl: CACHE_TTL,
				...options,
			});
		}
	}

	get(key: string): T | undefined {
		if (!this.useCache || !this.cache) return undefined;
		return this.cache.get(key);
	}

	set(key: string, value: T, ttl?: number): boolean {
		if (!this.useCache || !this.cache) return false;
		const anyCache = this.cache as any;
		if (typeof anyCache.set === "function") {
			try {
				return anyCache.set(key, value, { ttl });
			} catch {
				return anyCache.set(key, value, ttl);
			}
		}
		return false;
	}

	clear(): void {
		if (this.useCache && this.cache) {
			this.cache.clear();
		}
	}

	getStats(): { size: number } {
		if (this.useCache && this.cache) {
			return { size: this.cache.size };
		}
		return { size: 0 };
	}
}

/** Radio session manager */
class RadioSessionManager {
	private sessions = new Map<string, string>();
	private batchIds = new Map<string, string>();
	private trackIds = new Map<string, string[]>();
	private playedTracks = new Map<string, Set<string>>();
	private sessionPromises = new Map<string, Promise<string | null>>();

	async getOrCreateSession(
		trackId: string,
		api: YMApi,
	): Promise<string | null> {
		// Return existing session
		if (this.sessions.has(trackId)) {
			return this.sessions.get(trackId)!;
		}

		// Wait for in-progress session creation
		if (this.sessionPromises.has(trackId)) {
			return this.sessionPromises.get(trackId)!;
		}

		// Create new session
		const promise = api
			.createRotorSession([`track:${trackId}`], false)
			.then((session) => {
				this.sessions.set(trackId, session.radioSessionId);
				this.batchIds.set(trackId, session.batchId);
				this.playedTracks.set(trackId, new Set());
				return session.radioSessionId;
			})
			.catch((err) => {
				bot.logger.warn(`[Yandex] Failed to create rotor session: ${err}`, {
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

// ============================================
// Main Plugin Class
// ============================================

@Discord()
export default class YandexMusicPlugin implements MusicServicePlugin {
	name = "yandex";
	urlPatterns = [/music\.yandex\./];

	private results: SearchTrackResult[] = [];
	private wrapper = new WrappedYMApi();
	private api = new YMApi();
	private cache: CacheWrapper<SearchTrackResult[]>;
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
		this.cache = new CacheWrapper({ max: CACHE_MAX_SIZE, ttl: CACHE_TTL });
		this.startCacheCleanup();
	}

	// ============================================
	// Public API
	// ============================================

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

			// Check patterns in order of specificity
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
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.url_processing", {
					plugin: this.name,
					error: (error as Error).message,
				}),
			);
			return [];
		}
	}

	async getTrackUrl(trackId: string): Promise<string | null> {
		await this.ensureInitialized();

		if (!trackId) {
			bot.logger.error("YandexMusicPlugin: trackId is empty");
			return null;
		}

		try {
			return await this.fetchTrackUrl(trackId);
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.get_track_url", {
					trackId,
					error: (error as Error).message,
				}),
				error,
			);
			return null;
		}
	}

	async getRecommendations(trackId: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();

		// Return existing promise if in progress
		if (this.recommendationsPromises.has(trackId)) {
			bot.logger.debug(
				`[Yandex] Waiting for in-progress recommendations for track:${trackId}`,
				{ module: "Yandex" },
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
				? await this.api.getPlaylist(Number(playlistId), user)
				: await this.api.getPlaylist(playlistId);

			if (!playlistInfo?.tracks) {
				bot.logger.warn(
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
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.playlist.processing"),
				error,
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

			const albumInfo = await this.api.getAlbumWithTracks(Number(albumId));
			const results = this.processTrackList(albumInfo.volumes.flat());

			this.cache.set(cacheKey, results);
			return results;
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.track.processing"),
				error,
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
		bot.logger.info(`[Yandex] Radio sessions reset`, { module: "Yandex" });
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

	// ============================================
	// Private Methods
	// ============================================

	private isYandexMusicUrl(parsedUrl: URL): boolean {
		return (
			parsedUrl.hostname.endsWith("music.yandex.ru") ||
			parsedUrl.hostname.includes("music.yandex")
		);
	}

	private async fetchTrackUrl(trackId: string): Promise<string | null> {
		try {
			const url = await retry(
				() =>
					this.wrapper.getDownloadUrl(
						Number(trackId),
						{
							codec: Types.DownloadTrackCodec.MP3,
							quality: Types.DownloadTrackQuality.Lossless,
							forceRaw: false,
						}
					),
				RETRY_CONFIG,
			);
			if (url) return url;
		} catch {}
		return await retry(
			() =>
				this.wrapper.getDownloadUrl(
					Number(trackId),
					{
						codec: Types.DownloadTrackCodec.MP3,
						quality: Types.DownloadTrackQuality.Lossless,
						forceRaw: false,
					}
				),
			RETRY_CONFIG,
		);
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
			bot.logger.warn(
				`[Yandex] Error fetching recommendations for trackId:${trackId}`,
				e as Error,
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
			bot.logger.warn(`[Yandex] No valid sessionId for track:${trackId}`, {
				module: "Yandex",
			});
			return [];
		}

		try {
			const st = await this.api.postRotorSessionTracks(sessionId, {
				batchId: this.radioManager.getBatchId(trackId),
				queue: this.radioManager.getQueue(trackId),
			});

			return this.processStationTracks(trackId, st.sequence ?? []);
		} catch (err: any) {
			if (retry && err?.response?.status === 400) {
				bot.logger.warn(
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

				bot.logger.debug(`[Yandex] Added track: ${trackIdStr} - ${t.title}`, {
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
			const [trackInfo] = await this.api.getTrack(Number(trackId));
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
			bot.logger.error(`Error processing track ${trackId}:`, error);
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
			artists: [...trackInfo.artists.map((artist) => ({ name: artist.name }))],
			albums: [...trackInfo.albums.map((album) => ({ title: album.title }))],
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
			bot.logger.warn(
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
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.error_initializing_service"),
				error,
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
			const result = await retry(() => this.api.searchTracks(trackName), {
				retries: RETRY_CONFIG.retries,
				onRetry: (error: Error) =>
					bot.logger.warn(
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
			bot.logger.warn(
				bot.locale.t("plugins.yandex.errors.track.search", {
					query: trackName,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	private startCacheCleanup(): void {
		const env = process.env.USE_CACHE?.toLowerCase();
		const useCache = env === "true" || env === undefined;

		if (!useCache) return;

		this.cacheCleanupInterval = setInterval(() => {
			const stats = this.cache.getStats();
			if (stats.size > CACHE_CLEANUP_THRESHOLD) {
				this.cache.clear();
			}
		}, CACHE_CHECK_PERIOD);
	}
}
