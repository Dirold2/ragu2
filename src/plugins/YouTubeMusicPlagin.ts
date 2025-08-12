import retry from "async-retry";
import { Discord } from "discordx";
import { LRUCache } from "lru-cache";
import { URL } from "url";
import { Innertube, UniversalCache } from "youtubei.js";

import { bot } from "../bot.js";
import type { MusicServicePlugin } from "../interfaces/index.js";
import { type SearchTrackResult, TrackResultSchema } from "../types/index.js";

// YouTube API response types
interface YouTubeVideoInfo {
	basic_info: {
		title?: string;
		author?: string;
		channel?: {
			name?: string;
		};
		duration?: number;
	};
	streaming_data?: {
		adaptive_formats?: YouTubeFormat[];
	};
}

interface YouTubeFormat {
	itag?: number;
	has_audio?: boolean;
	has_video?: boolean;
	mime_type?: string;
	bitrate?: number;
	language?: string | null;
	is_original?: boolean;
	audio_track?: {
		display_name?: string;
	};
	url?: string;
	decipher?: () => string;
	duration?: number;
}

interface YouTubeSearchResult {
	id?: string;
	video_id?: string;
	title?: string;
	author?:
		| {
				name?: string;
		  }
		| string;
	duration?: string;
}

interface YouTubeSearchResponse {
	results?: YouTubeSearchResult[];
}

interface StreamingDataOptions {
	type: "audio";
	client: "TV";
	itag?: number;
	language?: string;
	codec?: string;
}

interface MinimalFormat {
	itag?: number;
	has_audio?: boolean;
	has_video?: boolean;
	mime_type?: string;
	bitrate?: number;
	language?: string | null;
	is_original?: boolean;
	audio_track?: { display_name?: string } | undefined;
	duration?: number;
}

interface TrackYouTube {
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
export default class YouTubeMusicPlugin implements MusicServicePlugin {
	name = "youtube";
	urlPatterns = [
		/^(https?:\/\/)?(www\.)?youtube\.com\//,
		/^(https?:\/\/)?(www\.)?music\.youtube\.com\//,
		/^(https?:\/\/)?(www\.)?youtu\.be\//,
	];

	// https://youtu.be/pAgnJDJN4VA?list=PLpZaq7kciiNIscD5bMLUIyesR_EHTSvxu
	private urlTrackRootPattern = /^\/([a-zA-Z0-9_-]{11})$/;
	// https://youtube.com/playlist?list=PLVktCYIdkbTOqhhtFSU3hioBuvuP9q_WQ&si=XF1rBo1u5s5xtVD7
	private urlGenericPlaylistPattern = /\/playlist/;
	private results: SearchTrackResult[] = [];
	private yt!: Innertube;
	private cache: CacheWrapper;
	private initialized = false;
	private initMutex = new Mutex();
	private cacheCleanupInterval: NodeJS.Timeout | null = null;

	hasAvailableResults = (): boolean => this.results.length > 0;

	async includesUrl(url: string): Promise<boolean> {
		try {
			const parsed = new URL(url);
			return this.urlGenericPlaylistPattern.test(parsed.pathname);
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
				!parsedUrl.hostname.includes("youtube.com") &&
				!parsedUrl.hostname.includes("music.youtube.com") &&
				!parsedUrl.hostname.includes("youtu.be")
			) {
				bot.logger.warn(`[YouTube] URL не принадлежит YouTube: ${url}`);
				return [];
			}

			// 1. Проверяем плейлист
			if (this.urlGenericPlaylistPattern.test(parsedUrl.pathname)) {
				const playlistId = parsedUrl.searchParams.get("list");
				if (playlistId) {
					return await this.getPlaylistTracks(playlistId);
				}
			}

			// 2. Проверяем короткий URL
			if (this.urlTrackRootPattern.test(parsedUrl.pathname)) {
				const videoId = this.extractVideoIdYT(url);
				if (videoId) {
					const videoId = this.extractVideoIdYT(url);
					if (!videoId) {
						bot.logger.warn(
							`[YouTube] Не удалось извлечь video ID из URL: ${url}`,
						);
						return [];
					}

					const info = (await this.yt.getInfo(videoId)) as YouTubeVideoInfo;
					const details = info.basic_info;

					const formatted = this.formatTrackInfo({
						id: videoId,
						title: String(details?.title ?? "Unknown Title"),
						artists: [
							{
								name: String(
									details?.author ?? details?.channel?.name ?? "Unknown Artist",
								),
							},
						],
						albums: [],
						durationMs: this.parseDurationToMs(details?.duration),
						coverUri: "",
					});

					const validated = this.validateTrackResult(formatted);
					return validated ? [validated] : [];
				}
			}

			// 3. Пытаемся извлечь videoId обычным способом
			const videoId = this.extractVideoIdYT(url);
			if (!videoId) {
				bot.logger.warn(`[YouTube] Не удалось извлечь video ID из URL: ${url}`);
				return [];
			}

			const info = (await this.yt.getInfo(videoId)) as YouTubeVideoInfo;
			const details = info.basic_info;

			const formatted = this.formatTrackInfo({
				id: videoId,
				title: String(details?.title ?? "Unknown Title"),
				artists: [
					{
						name: String(
							details?.author ?? details?.channel?.name ?? "Unknown Artist",
						),
					},
				],
				albums: [],
				durationMs: this.parseDurationToMs(details?.duration),
				coverUri: "",
			});

			const validated = this.validateTrackResult(formatted);
			return validated ? [validated] : [];
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.youtube.errors.url_processing", {
					plugin: this.name,
					error: (error as Error).message
				})
			);
			return [];
		}
	}

	private extractVideoIdYT(url: string): string | null {
		try {
			const parsedUrl = new URL(url);

			// 1. Короткие ссылки youtu.be/<id>
			if (parsedUrl.hostname.includes("youtu.be")) {
				const idMatch = parsedUrl.pathname.match(/^\/([a-zA-Z0-9_-]{11})$/);
				if (idMatch) return idMatch[1];
			}

			// 2. Обычные ссылки youtube.com/watch?v=<id>
			if (parsedUrl.searchParams.has("v")) {
				const id = parsedUrl.searchParams.get("v");
				if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
					return id;
				}
			}

			// 3. На случай формата /embed/<id> или /v/<id>
			const embedMatch = parsedUrl.pathname.match(
				/\/(embed|v)\/([a-zA-Z0-9_-]{11})/,
			);
			if (embedMatch) return embedMatch[2];

			return null;
		} catch {
			return null;
		}
	}

	async getTrackUrl(trackId: string): Promise<string | null> {
		await this.ensureInitialized();
		if (!trackId) {
			bot.logger.error("YouTubeMusicPlugin: trackId is empty");
			return null;
		}

		try {
			const url = await retry(
				async () => {
					const preferredLanguage = this.getPreferredLanguage();

					const info = (await this.yt.getInfo(trackId, {
						client: "TV",
					})) as YouTubeVideoInfo;
					const adaptiveFormats = info.streaming_data?.adaptive_formats ?? [];
					const picked = this.pickBestAudioFormat(
						adaptiveFormats,
						preferredLanguage,
					);

					// Try with selected itag first
					if (picked?.itag) {
						const resolved = await this.resolveDirectUrl(
							trackId,
							picked.itag,
							picked.language || preferredLanguage,
							YouTubeMusicPlugin.isMp4aMime(picked.mime_type),
						);
						if (resolved) return resolved;
					}

					const autoResolved = await this.resolveDirectUrl(
						trackId,
						undefined,
						preferredLanguage,
						true,
					);
					if (autoResolved) return autoResolved;

					throw new Error(`No direct audio URL found for ${trackId}`);
				},
				{
					retries: MAX_RETRIES,
					factor: 2,
					minTimeout: MIN_TIMEOUT,
					maxTimeout: MAX_TIMEOUT,
				},
			);

			return url;
		} catch (error) {
			const errmsg = (error as Error).message;
			bot.logger.error(
				bot.locale.t("plugins.youtube.errors.get_track_url", {
					trackId,
					error: errmsg,
				}),
			);
			return null;
		}
	}

	async getPlaylistTracks(playlistId: string): Promise<SearchTrackResult[]> {
		try {
			const cacheKey = `playlist_${playlistId}`;
			const cachedResults = this.cache.get<SearchTrackResult[]>(cacheKey);
			if (cachedResults) return cachedResults;

			const playlist = await this.yt.getPlaylist(playlistId);
			const videos: YouTubeSearchResult[] = (playlist as any)?.videos ?? [];
			const results: SearchTrackResult[] = [];

			for (const v of videos) {
				const id = v.id ?? v.video_id;
				const title = v.title;
				if (!id || !title) continue;
				const author = this.extractAuthorName(v);
				const durationMs = this.parseDurationToMs(v.duration);
				const formatted = this.formatTrackInfo({
					id: String(id),
					title: String(title),
					artists: [{ name: author }],
					albums: [],
					durationMs,
					coverUri: "",
				});
				const validated = this.validateTrackResult(formatted);
				if (validated) results.push(validated);
			}

			this.cache.set(cacheKey, results);
			return results;
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.youtube.errors.playlist.processing"),
				error,
			);
			return [];
		}
	}

	async getRecommendations(trackId: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();
		try {
			const cacheKey = `recommendations_${trackId}`;
			const cachedResults = this.cache.get<SearchTrackResult[]>(cacheKey);
			if (cachedResults) return cachedResults;

			// YouTube doesn't have a direct similar tracks API like Yandex
			// We can implement this by searching for related videos or using the video's metadata
			bot.logger.warn(
				`[YouTube] Recommendations not implemented for trackId: ${trackId}`,
			);
			return [];
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.youtube.errors.error_fetching_similar_tracks", {
					trackId,
				}),
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

	private getPreferredLanguage(): string {
		const envLang = process.env.YT_AUDIO_LANGUAGE?.trim();
		return envLang && envLang.length > 0 ? envLang : "en-US";
	}

	private static toMinimalFormat(format: YouTubeFormat): MinimalFormat {
		return {
			itag: format.itag,
			has_audio: format.has_audio,
			has_video: format.has_video,
			mime_type: format.mime_type,
			bitrate: format.bitrate,
			language: format.language ?? null,
			is_original: format.is_original,
			audio_track: format.audio_track,
			duration: format.duration,
		};
	}

	private static isMp4aMime(mimeType?: string): boolean {
		return /mp4a/i.test(String(mimeType || ""));
	}

	private pickBestAudioFormat(
		formats: YouTubeFormat[],
		preferredLanguage: string,
	): MinimalFormat | null {
		const minimal = formats.map(YouTubeMusicPlugin.toMinimalFormat);

		const languageMatch = minimal.find(
			(f) =>
				f.itag === 140 &&
				f.has_audio &&
				!f.has_video &&
				!!f.audio_track &&
				(f.language === preferredLanguage ||
					(preferredLanguage === "original" && !!f.is_original)),
		);
		if (languageMatch) return languageMatch;

		const candidates = minimal
			.filter(
				(f) =>
					f.has_audio &&
					!f.has_video &&
					YouTubeMusicPlugin.isMp4aMime(f.mime_type),
			)
			.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

		return candidates[0] ?? null;
	}

	private async resolveDirectUrl(
		videoId: string,
		itag?: number,
		language?: string,
		preferMp4a = true,
	): Promise<string | null> {
		const options: StreamingDataOptions = {
			type: "audio",
			client: "TV",
		};
		if (itag) options.itag = itag;
		if (language) options.language = language;
		if (preferMp4a) options.codec = "mp4a";

		const fmt = (await this.yt.getStreamingData(
			videoId,
			options,
		)) as YouTubeFormat;
		const maybeDeciphered = fmt.decipher?.();
		const directUrl = maybeDeciphered || fmt.url;
		return typeof directUrl === "string" && directUrl.startsWith("http")
			? directUrl
			: null;
	}

	private extractAuthorName(item: YouTubeSearchResult): string {
		if (typeof item.author === "string") {
			return item.author;
		}
		return item.author?.name || "Unknown Artist";
	}

	private formatTrackInfo(trackInfo: TrackYouTube): SearchTrackResult {
		return {
			id: trackInfo.id.toString(),
			title: trackInfo.title,
			artists: trackInfo.artists.map((artist) => ({ name: artist.name })),
			albums: trackInfo.albums.map((album) => ({ title: album.title })),
			durationMs: trackInfo.durationMs ?? 0,
			cover: trackInfo.coverUri || "",
			source: "youtube",
		};
	}

	private validateTrackResult(
		searchResult: SearchTrackResult,
	): SearchTrackResult | null {
		const validation = TrackResultSchema.safeParse(searchResult);
		if (!validation.success) {
			bot.logger.warn(
				bot.locale.t("plugins.youtube.errors.track.invalid_data", {
					error: JSON.stringify(validation.error),
				}),
			);
			return null;
		}
		return validation.data;
	}

	private parseDurationToMs(
		duration?: string | number | null,
	): number | undefined {
		if (typeof duration === "number" && !isNaN(duration)) {
			return duration * 1000; // сек → мс
		}
		if (typeof duration === "string") {
			const parts = duration.split(":").map(Number);
			if (parts.some(isNaN)) return undefined;
			let seconds = 0;
			for (const part of parts) {
				seconds = seconds * 60 + part;
			}
			return seconds * 1000;
		}
		return undefined;
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;
		const release = await this.initMutex.acquire();
		try {
			if (this.initialized) return;
			this.yt = await Innertube.create({
				location: "US",
				cache: new UniversalCache(false),
				generate_session_locally: true,
				// fetch: this.createTypeSafeFetch(this.proxyAgent),
			});
			this.initialized = true;
			bot.logger.debug("YouTubeMusicPlugin initialized (youtubei.js)");
		} catch (error) {
			bot.logger.error(
				bot.locale.t("plugins.youtube.errors.error_initializing_service"),
				error,
			);
			throw new Error(
				bot.locale.t("plugins.youtube.errors.failed_to_initialize"),
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
			const result = await retry(
				async () => {
					const search = (await this.yt.search(trackName, {
						type: "video",
					})) as YouTubeSearchResponse;
					return search;
				},
				{
					retries: MAX_RETRIES,
					onRetry: (error: Error) =>
						bot.logger.warn(
							`${bot.locale.t("plugins.youtube.errors.retrying_search", {
								trackName,
							})}: ${error.message}`,
						),
				},
			);

			if (!result?.results) return [];

			const validatedTracks = result.results
				.map((item: YouTubeSearchResult) => {
					const id = item.id ?? item.video_id;
					const title = item.title;
					if (!id || !title) return null;

					const authorName = this.extractAuthorName(item);
					const durationMs = this.parseDurationToMs(item.duration);
					const formatted = this.formatTrackInfo({
						id: String(id),
						title: String(title),
						artists: [{ name: authorName }],
						albums: [],
						durationMs,
						coverUri: "",
					});
					return this.validateTrackResult(formatted);
				})
				.filter((t: SearchTrackResult): t is SearchTrackResult => t !== null);

			if (validatedTracks.length > 0) {
				this.cache.set(cacheKey, validatedTracks);
				this.results = validatedTracks;
			}

			return validatedTracks;
		} catch (error) {
			bot.logger.warn(
				bot.locale.t("plugins.youtube.errors.track.search", {
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
