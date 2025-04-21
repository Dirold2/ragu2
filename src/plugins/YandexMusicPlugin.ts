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

const CACHE_TTL = 600 * 1000;
const CACHE_CHECK_PERIOD = 120 * 1000;
const MAX_RETRIES = 3;
const MIN_TIMEOUT = 1000;
const MAX_TIMEOUT = 5000;

/**
 * Cache wrapper class that conditionally uses LRUCache based on environment variable
 */
class CacheWrapper {
	private cache: LRUCache<string, any> | null = null;
	private useCache: boolean;

	constructor(options?: LRUCache.Options<string, any, unknown>) {
		this.useCache = process.env.USE_CACHE?.toLowerCase() === "true" || true;

		if (this.useCache) {
			this.cache = new LRUCache<string, any>({
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

	set<T>(key: string, value: T, ttl?: number) {
		if (!this.useCache || !this.cache?.set) return false;
		return this.cache.set(key, value, { ttl });
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
	private urlPlaylistPattern = /\/users\/([^/]+)\/playlists\/(\d+)/;
	private urlAlbumPattern = /\/album\/(\d+)(\?.*)?$/;

	private results: SearchTrackResult[] = [];
	private wrapper = new WrappedYMApi();
	private api = new YMApi();
	private cache: CacheWrapper;
	private initialized = false;

	hasAvailableResults = (): boolean => this.results.length > 0;

	async includesUrl(url: string): Promise<boolean> {
		return this.urlPlaylistPattern.test(url) || this.urlAlbumPattern.test(url);
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
			if (!parsedUrl.hostname.includes("music.yandex")) return [];

			if (this.urlAlbumPattern.test(parsedUrl.pathname)) {
				const albumId = this.extractId(parsedUrl, this.urlAlbumPattern);
				return albumId ? await this.getAlbumTracks(albumId) : [];
			}

			if (this.urlPlaylistPattern.test(parsedUrl.pathname)) {
				const { playlistId, playlistName } =
					this.extractPlaylistInfo(parsedUrl);
				return playlistId && playlistName
					? await this.getPlaylistTracks(playlistId, playlistName)
					: [];
			}

			const trackId = this.extractId(parsedUrl, this.urlTrackPattern);
			if (trackId) {
				const [trackInfo] = await this.api.getTrack(Number(trackId));
				return trackInfo
					? [this.validateTrackResult(this.formatTrackInfo(trackInfo))].filter(
							(result): result is SearchTrackResult => result !== null,
						)
					: [];
			}

			return [];
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.url_processing", {
					name: this.name,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	async getTrackUrl(trackId: string): Promise<string | null> {
		await this.ensureInitialized();
		if (!trackId) return null;

		try {
			return (
				(await retry(
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
				)) || null
			);
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.track.url_not_found", {
					trackId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return null;
		}
	}

	async getPlaylistTracks(
		playlistId: string,
		playlistName: string,
	): Promise<SearchTrackResult[]> {
		try {
			const cacheKey = `playlist_${playlistId}_${playlistName}`;
			const cachedResults = this.cache.get<SearchTrackResult[]>(cacheKey);

			if (cachedResults) {
				return cachedResults;
			}

			const playlistInfo = await this.api.getPlaylist(
				Number(playlistId),
				playlistName,
			);
			if (!playlistInfo?.tracks) {
				bot.logger.warn(
					bot.locale.t("plugins.yandex.errors.playlist.not_found"),
				);
				return [];
			}

			const results = (playlistInfo.tracks as PlaylistTrack[])
				.map((track) => {
					const trackData = track.track;
					return this.formatTrackInfo({
						id: trackData.id,
						title: trackData.title,
						artists: trackData.artists,
						albums: trackData.albums,
						durationMs: trackData.durationMs,
						coverUri: trackData.coverUri,
					});
				})
				.map((track) => this.validateTrackResult(track))
				.filter((track): track is SearchTrackResult => track !== null);

			this.cache.set(cacheKey, results);
			return results;
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.playlist.processing", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	async getAlbumTracks(albumId: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();
		try {
			const cacheKey = `album_${albumId}`;
			const cachedResults = this.cache.get<SearchTrackResult[]>(cacheKey);

			if (cachedResults) {
				return cachedResults;
			}

			const albumInfo = await this.api.getAlbumWithTracks(Number(albumId));
			const results = albumInfo.volumes
				.flat()
				.map((track) => this.formatTrackInfo(track))
				.map((track) => this.validateTrackResult(track))
				.filter((track): track is SearchTrackResult => track !== null);

			this.cache.set(cacheKey, results);
			return results;
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.track.processing", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	async getRecommendations(trackId: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();
		try {
			const cacheKey = `recommendations_${trackId}`;
			const cachedResults = this.cache.get<SearchTrackResult[]>(cacheKey);

			if (cachedResults) {
				return cachedResults;
			}

			const similarTracks = await this.api.getSimilarTracks(Number(trackId));
			if (!similarTracks?.similarTracks) {
				bot.logger.warn(
					bot.locale.t("plugins.yandex.errors.no_similar_tracks_found", {
						trackId,
					}),
				);
				return [];
			}

			const results = similarTracks.similarTracks
				.map((track) => this.formatTrackInfo(track))
				.map((track) => this.validateTrackResult(track))
				.filter((track): track is SearchTrackResult => track !== null);

			this.cache.set(cacheKey, results);
			return results;
		} catch (error) {
			bot.logger.error(
				`${bot.locale.t("plugins.yandex.errors.error_fetching_similar_tracks", { trackId })}: ${error instanceof Error ? error.message : String(error)}`,
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

	private extractPlaylistInfo(parsedUrl: URL): {
		playlistName: string | null;
		playlistId: string | null;
	} {
		const match = parsedUrl.pathname.match(this.urlPlaylistPattern);
		return {
			playlistName: match?.[1] ?? null,
			playlistId: match?.[2] ?? null,
		};
	}

	private formatTrackInfo(trackInfo: TrackYandex): SearchTrackResult {
		return {
			id: trackInfo.id.toString(),
			title: trackInfo.title,
			artists: trackInfo.artists.map((artist) => ({ name: artist.name })),
			albums: trackInfo.albums.map((album) => ({ title: album.title })),
			duration: this.formatDuration(trackInfo.durationMs || 0),
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

		if (!access_token || isNaN(uid)) {
			throw new Error(
				bot.locale.t("plugins.yandex.errors.plugin.missing_config"),
			);
		}

		const config = { access_token, uid };
		const validation = ConfigSchema.safeParse(config);

		if (!validation.success) {
			throw new Error(
				bot.locale.t("plugins.yandex.errors.plugin.invalid_config", {
					errors: validation.error.errors.map((err) => err.message).join(", "),
				}),
			);
		}

		return validation.data;
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;

		try {
			const config = this.loadConfig();
			await Promise.all([this.wrapper.init(config), this.api.init(config)]);
			this.initialized = true;
		} catch (error) {
			bot.logger.error(
				`${bot.locale.t("plugins.yandex.errors.error_initializing_service")}: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw new Error(
				bot.locale.t("plugins.yandex.errors.failed_to_initialize"),
			);
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
						`${bot.locale.t("plugins.yandex.errors.retrying_search", { trackName })}: ${error.message}`,
					),
			});

			if (!result?.tracks?.results) {
				return [];
			}

			const validatedTracks = result.tracks.results
				.map((track: TrackYandex) => this.formatTrackInfo(track))
				.map((track: SearchTrackResult) => this.validateTrackResult(track))
				.filter(
					(track: SearchTrackResult): track is SearchTrackResult =>
						track !== null,
				);

			if (validatedTracks.length > 0) {
				this.cache.set(cacheKey, validatedTracks);
				this.results = validatedTracks;
			}

			return validatedTracks;
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.yandex.errors.track.search", {
					query: trackName,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	private formatDuration(durationMs: number): string {
		if (typeof durationMs !== "number") {
			return "0:00";
		}
		const minutes = Math.floor(durationMs / 60000);
		const seconds = Math.floor((durationMs % 60000) / 1000)
			.toString()
			.padStart(2, "0");
		return `${minutes}:${seconds}`;
	}

	public async destroy(): Promise<void> {
		this.results = [];
		this.cache.clear();

		if (this.wrapper) {
			this.wrapper = new WrappedYMApi();
		}
		if (this.api) {
			this.api = new YMApi();
		}

		this.initialized = false;
	}

	private startCacheCleanup(): void {
		if (process.env.USE_CACHE?.toLowerCase() === "true") {
			setInterval(() => {
				const stats = this.cache.getStats();
				if (stats.size > 800) {
					this.cache.clear();
				}
			}, CACHE_CHECK_PERIOD);
		}
	}

	constructor() {
		this.cache = new CacheWrapper({
			max: 1000,
			ttl: CACHE_TTL,
		});

		this.startCacheCleanup();
	}
}
