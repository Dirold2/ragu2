import YTMusic from "ytmusic-api";
import ytdl from "@distube/ytdl-core";
import { bot } from "../bot.js";
import type { MusicServicePlugin } from "../interfaces/index.js";
import { type SearchTrackResult, TrackResultSchema } from "../types/index.js";
import {
	YOUTUBE_CONFIG,
	isRetryableError,
	calculateRetryDelay,
} from "../utils/youtubeConfig.js";
import rawCookies from "../../cookies.json" with { type: "json" };

type CookieEntry = {
	name: string;
	value: string;
	expirationDate?: number;
	domain?: string;
	path?: string;
	secure?: boolean;
	httpOnly?: boolean;
	hostOnly?: boolean;
	sameSite?: string;
};

/**
 * Утилиты для работы с cookies: нормализует и собирает строку.
 */
function buildCookieHeader(cookies: CookieEntry[]): string {
	return cookies
		.map(({ name, value }) => `${name}=${value}`)
		.filter(Boolean)
		.join("; ");
}

function normalizeRawCookies(raw: any[]): CookieEntry[] {
	return raw.map((cookie) => {
		// Убираем sameSite если undefined/null чтобы не ломать
		const { sameSite, ...rest } = cookie;
		return {
			...rest,
			...(sameSite ? { sameSite } : {}),
		} as CookieEntry;
	});
}

/**
 * Retry функция с экспоненциальной задержкой
 */
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries: number = YOUTUBE_CONFIG.RETRY.MAX_ATTEMPTS,
	baseDelay: number = YOUTUBE_CONFIG.RETRY.BASE_DELAY,
): Promise<T> {
	let lastError: Error;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			// Проверяем, стоит ли повторять ошибку
			if (!isRetryableError(lastError)) {
				throw lastError;
			}

			if (attempt < maxRetries) {
				const delay = calculateRetryDelay(attempt, baseDelay);
				bot?.logger.debug(
					`[YouTube] Retry attempt ${attempt}/${maxRetries} in ${delay}ms after error: ${lastError.message}`,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	throw lastError!;
}

export default class YouTubeMusicPlagin implements MusicServicePlugin {
	name = "youtube";
	urlPatterns = [
		/^(https?:\/\/)?(www\.)?youtube\.com\//,
		/^(https?:\/\/)?(www\.)?music\.youtube\.com\//,
		/^(https?:\/\/)?(www\.)?youtu\.be\//,
	];
	// disabled = true;

	private ytmusic: YTMusic;
	private initialized = false;
	private readonly logger = bot.logger;

	constructor() {
		this.ytmusic = new YTMusic();
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;

		try {
			const cookies = normalizeRawCookies(rawCookies);

			const cookieString = buildCookieHeader(cookies);

			await this.ytmusic.initialize({ cookies: cookieString });
			ytdl.createAgent(
				cookies.filter(
					(c) => typeof c.name === "string" && typeof c.value === "string",
				),
			);

			this.initialized = true;
			this.logger.debug(
				"YouTubeMusicPlugin initialized (ytmusic-api + ytdl-core agent)",
			);
		} catch (err) {
			this.logger.error(
				`Failed to initialize YouTubeMusicPlugin: ${(err as Error).message}`,
			);
			throw err;
		}
	}

	async hasAvailableResults(): Promise<boolean> {
		// Если нужно сохранять результаты — лучше внедрить кеш отдельно.
		// Здесь можно просто вернуть true если инициализирован.
		return this.initialized;
	}

	private mapToSearchTrackResult(
		videoId: string,
		title: string,
		artistName: string,
	): SearchTrackResult | null {
		try {
			return TrackResultSchema.parse({
				id: videoId,
				title,
				artists: [{ name: artistName || "Unknown Artist" }],
				albums: [],
				source: "youtube",
			});
		} catch (e) {
			this.logger.warn(
				`TrackResultSchema validation failed for ${videoId}: ${e}`,
			);
			return null;
		}
	}

	async searchName(trackName: string): Promise<SearchTrackResult[]> {
		try {
			await this.ensureInitialized();

			const rawTracks = await retryWithBackoff(async () => {
				return await this.ytmusic.searchSongs(trackName);
			});

			if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
				this.logger.warn(`[YouTube] No search results for: ${trackName}`);
				return [];
			}

			const results: SearchTrackResult[] = [];

			for (const t of rawTracks) {
				const videoId = t.videoId;
				const title = t.name || "Unknown Title";
				const artistName = t.artist?.name || "Unknown Artist";

				if (!videoId || !title) continue;

				const track = this.mapToSearchTrackResult(videoId, title, artistName);
				if (track) results.push(track);
			}

			this.logger.debug(
				`[YouTube] Found ${results.length} tracks for: ${trackName}`,
			);
			return results;
		} catch (error) {
			const errorMessage = (error as Error).message;

			// Логируем разные типы ошибок по-разному
			if (
				errorMessage.includes("timeout") ||
				errorMessage.includes("connect")
			) {
				this.logger.error(
					`[YouTube] Connection timeout while searching for "${trackName}": ${errorMessage}`,
				);
			} else if (
				errorMessage.includes("rate limit") ||
				errorMessage.includes("quota")
			) {
				this.logger.error(
					`[YouTube] Rate limit/quota exceeded while searching for "${trackName}": ${errorMessage}`,
				);
			} else {
				this.logger.debug(
					`[YouTube] Error searching for track "${trackName}": ${errorMessage}`,
				);
			}
			return [];
		}
	}

	async searchURL(url: string): Promise<SearchTrackResult[]> {
		try {
			await this.ensureInitialized();

			const info = await retryWithBackoff(async () => {
				return await ytdl.getInfo(url);
			});

			const details = info.videoDetails;

			const videoId = details.videoId;
			const title = details.title || "Unknown Title";
			const authorName = details.author?.name || "Unknown Artist";

			const track = this.mapToSearchTrackResult(videoId, title, authorName);
			if (!track) {
				this.logger.warn(`[YouTube] Parsed track is invalid for URL: ${url}`);
				return [];
			}

			this.logger.debug(`[YouTube] Found track: ${title} from URL`);
			return [track];
		} catch (error) {
			const errorMessage = (error as Error).message;

			// Улучшенная обработка ошибок для URL
			if (
				errorMessage.includes("timeout") ||
				errorMessage.includes("connect")
			) {
				this.logger.error(
					`[YouTube] Connection timeout while processing URL: ${url} - ${errorMessage}`,
				);
			} else if (
				errorMessage.includes("Video unavailable") ||
				errorMessage.includes("Private video")
			) {
				this.logger.error(
					`[YouTube] Video unavailable or private: ${url} - ${errorMessage}`,
				);
			} else if (errorMessage.includes("No playable formats found")) {
				this.logger.error(
					`[YouTube] No playable formats found for URL: ${url} - ${errorMessage}`,
				);
			} else {
				this.logger.error(
					`[YouTube] Error processing URL: ${url} - ${errorMessage}`,
				);
			}
			return [];
		}
	}

	async getTrackUrl(trackId: string): Promise<string> {
		if (!trackId) {
			this.logger.error("Error getting track URL: videoId is undefined");
			return "";
		}

		try {
			await this.ensureInitialized();

			// Явно формируем ссылку на видео (обычный youtube, не обязательно music)
			const url = `https://www.youtube.com/watch?v=${trackId}`;

			const info = await retryWithBackoff(async () => {
				return await ytdl.getInfo(url);
			});

			const audioFormat = ytdl.chooseFormat(info.formats, {
				quality: "highestaudio",
			});

			if (audioFormat?.url) {
				this.logger.debug(`[YouTube] Got download URL for video: ${trackId}`);
				return audioFormat.url;
			}

			this.logger.error(`No suitable audio format found for video: ${trackId}`);
			return "";
		} catch (error) {
			const errorMessage = (error as Error).message;

			// Улучшенная обработка ошибок для получения URL
			if (
				errorMessage.includes("timeout") ||
				errorMessage.includes("connect")
			) {
				this.logger.error(
					`[YouTube] Connection timeout while getting audio URL for ${trackId}: ${errorMessage}`,
				);
			} else if (
				errorMessage.includes("Video unavailable") ||
				errorMessage.includes("Private video")
			) {
				this.logger.error(
					`[YouTube] Video unavailable or private for ${trackId}: ${errorMessage}`,
				);
			} else if (errorMessage.includes("No playable formats found")) {
				this.logger.error(
					`[YouTube] No playable formats found for ${trackId}: ${errorMessage}`,
				);
			} else {
				this.logger.error(
					`[YouTube] Error getting audio URL for ${trackId}: ${errorMessage}`,
				);
			}
			return "";
		}
	}
}
