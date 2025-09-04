import retry from "async-retry";
import { Discord } from "discordx";
import { LRUCache } from "lru-cache";
import { URL } from "url";
import { Types, WrappedYMApi, YMApi } from "ym-api-meowed";

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
	artists: Array<{ name: string }>;
	albums: Array<{ title?: string }>;
	durationMs: number | undefined;
	coverUri: string | undefined;
}

type KeyType = string;
type ValueType = any;
type ContextType = undefined;

const CACHE_TTL = 600 * 1000;
const CACHE_CHECK_PERIOD = 120 * 1000;
const MAX_RETRIES = 3;
const MIN_TIMEOUT = 1000;
const MAX_TIMEOUT = 5000;

/** Простой мьютекс для предотвращения параллельной инициализации */
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

/**
 * Обёртка кеша поверх LRUCache с условным включением
 */
class CacheWrapper {
	private cache: LRUCache<KeyType, ValueType, ContextType> | null = null;
	private readonly useCache: boolean;

	constructor(
		options?: Partial<LRUCache.Options<KeyType, ValueType, ContextType>>,
	) {
		const env = process.env.USE_CACHE?.toLowerCase();
		this.useCache = env === "true" || env === undefined;

		if (this.useCache) {
			this.cache = new LRUCache<KeyType, ValueType, ContextType>({
				max: 1000,
				ttl: CACHE_TTL,
				...options,
			});
		}
	}

	get<T>(key: string): T | undefined {
		if (!this.useCache || !this.cache) return undefined;
		return this.cache.get(key) as T | undefined;
	}

	set<T>(key: string, value: T, ttl?: number): boolean {
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

@Discord()
export default class YandexMusicPlugin implements MusicServicePlugin {
	name = "yandex";
	urlPatterns = [/music\.yandex\./];

	private urlTrackPattern = /\/album\/\d+\/track\/(\d+)/;
	private urlTrackRootPattern = /\/track\/(\d+)/;
	private urlUserPlaylistPattern = /\/users\/([^/]+)\/playlists\/(\d+)/i;
	private urlGenericPlaylistPattern =
		/\/playlists\/([a-z]+\.[a-f0-9-]+|[a-f0-9-]{36})/i;

	private urlAlbumPattern = /\/album\/(\d+)(\?.*)?$/;

	private results: SearchTrackResult[] = [];
	private wrapper = new WrappedYMApi();
	private api = new YMApi();
	private cache: CacheWrapper;
	private initialized = false;
	private initMutex = new Mutex();
	private cacheCleanupInterval: NodeJS.Timeout | null = null;

	hasAvailableResults = (): boolean => this.results.length > 0;

	async includesUrl(url: string): Promise<boolean> {
		try {
			const parsed = new URL(url);
			return (
				this.urlGenericPlaylistPattern.test(parsed.pathname) ||
				this.urlUserPlaylistPattern.test(parsed.pathname) ||
				this.urlAlbumPattern.test(parsed.pathname)
			);
		} catch {
			return false;
		}
	}

	async searchName(trackName: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();
		const cacheKey = `search_${trackName}`;
		const cachedResults = this.cache.get<SearchTrackResult[]>(cacheKey);
		if (cachedResults) {
			return cachedResults;
		}
		return await this.updateCacheInBackground(trackName, cacheKey);
	}

	async searchURL(url: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();
		try {
			const parsedUrl = new URL(url);

			if (
				!parsedUrl.hostname.endsWith("music.yandex.ru") &&
				!parsedUrl.hostname.includes("music.yandex")
			) {
				return [];
			}

			// Проверка на альбом
			if (this.urlAlbumPattern.test(parsedUrl.pathname)) {
				const albumId = this.extractId(parsedUrl, this.urlAlbumPattern);
				return albumId ? await this.getAlbumTracks(albumId) : [];
			}

			// Обработка пользовательских плейлистов /users/:userId/playlists/:playlistId
			if (this.urlUserPlaylistPattern.test(parsedUrl.pathname)) {
				const match = parsedUrl.pathname.match(this.urlUserPlaylistPattern);
				if (match) {
					const user = match[1];
					const playlistId = match[2];
					return await this.getPlaylistTracks(playlistId, user);
				}
			}

			// Обработка плейлистов формата /playlists/<playlistKind>
			if (this.urlGenericPlaylistPattern.test(parsedUrl.pathname)) {
				const match = parsedUrl.pathname.match(this.urlGenericPlaylistPattern);
				if (match) {
					const playlistKind = match[1];
					return await this.getPlaylistTracks(playlistKind);
				}
			}

			// Обработка треков (корневой и другие паттерны)
			if (this.urlTrackRootPattern.test(parsedUrl.pathname)) {
				const trackId = this.extractId(parsedUrl, this.urlTrackRootPattern);
				if (trackId) {
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
				}
			}

			const trackId = this.extractId(parsedUrl, this.urlTrackPattern);
			if (trackId) {
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
			}

			return [];
		} catch (error) {
			bot.logger.error(bot.locale.t("plugins.yandex.errors.url_processing", {plugin: this.name, error: (error as Error).message}));
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
			const url = await retry(
				() =>
					this.wrapper.getMp3DownloadUrl(
						Number(trackId),
						false,
						Types.DownloadTrackQuality.High,
					),
				{
					retries: MAX_RETRIES,
					factor: 2,
					minTimeout: MIN_TIMEOUT,
					maxTimeout: MAX_TIMEOUT,
				},
			);

			if (!url) {
				bot.logger.warn(
					`YandexMusicPlugin: No download URL for trackId ${trackId}`,
				);
				return null;
			}

			return url;
		} catch (error) {
			bot.logger.error(bot.locale.t("plugins.yandex.errors.get_track_url", { trackId, error: (error as Error).message }), error);
			return null;
		}
	}

	async getPlaylistTracks(
		playlistId: string,
		user?: string,
	): Promise<SearchTrackResult[]> {
		try {
			const cacheKey = `playlist_${playlistId}_${user}`;
			const cachedResults = this.cache.get<SearchTrackResult[]>(cacheKey);
			if (cachedResults) return cachedResults;

			let playlistInfo;
			if (/^\d+$/.test(playlistId)) {
				playlistInfo = await this.api.getPlaylist(Number(playlistId), user);
			} else {
				playlistInfo = await this.api.getPlaylist(playlistId);
			}

			if (!playlistInfo?.tracks) {
				bot.logger.warn(
					bot.locale.t("plugins.yandex.errors.playlist.not_found"),
				);
				return [];
			}

			const results = (playlistInfo.tracks as PlaylistTrack[])
				.map((track) => {
					const t = track.track;
					const formatted = this.formatTrackInfo({
						id: t.id,
						title: t.title,
						artists: t.artists,
						albums: t.albums,
						durationMs: t.durationMs,
						coverUri: t.coverUri,
					});
					return this.validateTrackResult(formatted);
				})
				.filter((t): t is SearchTrackResult => t !== null);

			this.cache.set(cacheKey, results);
			return results;
		} catch (error) {
			bot.logger.error(bot.locale.t("plugins.yandex.errors.playlist.processing"), error);
			return [];
		}
	}

	async getAlbumTracks(albumId: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();
		try {
			const cacheKey = `album_${albumId}`;
			const cachedResults = this.cache.get<SearchTrackResult[]>(cacheKey);
			if (cachedResults) return cachedResults;

			const albumInfo = await this.api.getAlbumWithTracks(Number(albumId));
			const results = albumInfo.volumes
				.flat()
				.map((track: TrackYandex) => this.formatTrackInfo(track))
				.map((track: { id: string; title: string; artists: { name: string; }[]; source: string; albums?: { title?: string | undefined; }[] | undefined; durationMs?: number | undefined; cover?: string | undefined; url?: string | undefined; items?: string | undefined; }) => this.validateTrackResult(track))
				.filter((t): t is SearchTrackResult => t !== null);

			this.cache.set(cacheKey, results);
			return results;
		} catch (error) {
			bot.logger.error(bot.locale.t("plugins.yandex.errors.track.processing"), error);
			return [];
		}
	}

	async getRecommendations(trackId: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();
		const cacheKey = `recommendations_${trackId}`;
		const cachedResults = this.cache.get<SearchTrackResult[]>(cacheKey);
		if (cachedResults) return cachedResults;

		// Сначала пробуем станцию через официальный метод API
		try {
			bot.logger.debug(`[Yandex] recommendations via station: track:${trackId}`);
			const stationId = `track:${trackId}`;
			const station = await this.api.getStationTracks(stationId);
			const collected: SearchTrackResult[] = (station.sequence ?? [])
				.map((item: any) => item?.track)
				.filter(Boolean)
				.slice(0, 5)
				.map((t: any) => ({
					id: String(t.id),
					title: t.title,
					artists: (t.artists ?? []).map((a: any) => ({ name: a.name })),
					source: "yandex",
				}))
				.map((track: any) => this.validateTrackResult(track))
				.filter((t: any): t is SearchTrackResult => t !== null);

			if (collected.length > 0) {
				bot.logger.debug(`[Yandex] station collected=${collected.length}`);
				this.cache.set(cacheKey, collected);
				return collected;
			}
		} catch (e) {
			bot.logger.warn(
				bot.locale.t("plugins.yandex.errors.error_fetching_similar_tracks", { trackId }),
				e as Error,
			);
		}
		
		try {
			bot.logger.debug(`[Yandex] recommendations via similar: track:${trackId}`);
			const similarTracks = await this.api.getSimilarTracks(Number(trackId));
			if (!similarTracks?.similarTracks) return [];
			const results = similarTracks.similarTracks
				.map((track: TrackYandex) => this.formatTrackInfo(track))
				.map((track: any) => this.validateTrackResult(track))
				.filter((t: any): t is SearchTrackResult => t !== null);
			this.cache.set(cacheKey, results);
			return results;
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.error_fetching_similar_tracks", { trackId }),
				error,
			);
			return [];
		}
	}

	clearCache(): void {
		this.cache.clear();
		this.results = [];
	}

	getResults = (): SearchTrackResult[] => [...this.results];

	private extractId(parsedUrl: URL, pattern: RegExp): string | null {
		const match = parsedUrl.pathname.match(pattern);
		return match?.[1] ?? null;
	}

	private formatTrackInfo(trackInfo: TrackYandex): SearchTrackResult {
		return {
			id: trackInfo.id.toString(),
			title: trackInfo.title,
			artists: trackInfo.artists.map((artist) => ({ name: artist.name })),
			albums: trackInfo.albums.map((album) => ({ title: album.title })),
			durationMs: trackInfo.durationMs ?? 0,
			cover: trackInfo.coverUri || "",
			source: "yandex",
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

		let config
		if(username! || password!){
			config = { access_token, uid, username, password };
		}
		config = { access_token, uid };
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
			bot.logger.error(bot.locale.t("plugins.yandex.errors.error_initializing_service"), error);
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
				retries: MAX_RETRIES,
				onRetry: (error: Error) =>
					bot.logger.warn(
						`${bot.locale.t("plugins.yandex.errors.retrying_search", {
							trackName,
						})}: ${error.message}`,
					),
			});

			if (!result?.tracks?.results) return [];

			const validatedTracks = result.tracks.results
				.map((track: TrackYandex) => this.formatTrackInfo(track))
				.map((track: SearchTrackResult) => this.validateTrackResult(track))
				.filter((t: any): t is SearchTrackResult => t !== null);

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

	public async destroy(): Promise<void> {
		this.results = [];
		this.cache.clear();
		this.initialized = false;

		if (this.cacheCleanupInterval) {
			clearInterval(this.cacheCleanupInterval);
			this.cacheCleanupInterval = null;
		}
	}

	private startCacheCleanup(): void {
		const env = process.env.USE_CACHE?.toLowerCase();
		const useCache = env === "true" || env === undefined;
		if (!useCache) return;

		this.cacheCleanupInterval = setInterval(() => {
			const stats = this.cache.getStats();
			if (stats.size > 800) {
				this.cache.clear();
			}
		}, CACHE_CHECK_PERIOD);
	}

	constructor() {
		this.cache = new CacheWrapper({
			max: 1000,
			ttl: CACHE_TTL,
		});

		this.startCacheCleanup();
	}
}
