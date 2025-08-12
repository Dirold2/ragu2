import { Innertube, UniversalCache } from "youtubei.js";
import { bot } from "../bot.js";
import type { MusicServicePlugin } from "../interfaces/index.js";
import { type SearchTrackResult, TrackResultSchema } from "../types/index.js";

/**
 * @ru Плагин источника YouTube: поиск по имени/URL и получение прямого URL аудио дорожки.
 * @en YouTube source plugin: search by name/URL and retrieve a direct audio track URL.
 */
export default class YouTubeMusicPlugin implements MusicServicePlugin {
	name = "youtube";
	urlPatterns = [
		/^(https?:\/\/)?(www\.)?youtube\.com\//,
		/^(https?:\/\/)?(www\.)?music\.youtube\.com\//,
		/^(https?:\/\/)?(www\.)?youtu\.be\//,
	];

	private readonly logger = bot.logger;
	private yt!: Innertube;
	private initialized = false;

	// Common URL parsers
	private readonly videoIdParam = /[?&#]v=([^&#]+)/;
	private readonly shortIdPath = /youtu\.be\/([^?&#/]+)/;
	// private readonly playlistIdParam = /[?&#]list=([^&#]+)/;

	private stripListParam(rawUrl: string): string {
		try {
			const u = new URL(rawUrl);
			if (u.searchParams.has("list")) {
				u.searchParams.delete("list");
				this.logger.debug("[YouTube] Stripped list parameter from URL");
			}
			return u.toString();
		} catch {
			return rawUrl
				.replace(/([?&])list=[^&#]+(&|$)/, (_m, p1, p2) => (p2 ? p1 : ""))
				.replace(/\?$/, "");
		}
	}

	/**
	 * @ru Возвращает предпочитаемый язык аудио-дорожки.
	 * @en Returns the preferred audio track language.
	 */
	private getPreferredLanguage(): string {
		const envLang = process.env.YT_AUDIO_LANGUAGE?.trim();
		return envLang && envLang.length > 0 ? envLang : "en-US";
	}

	/**
	 * @ru Минимальная форма формата YouTube, используемая для выбора аудио.
	 * @en Minimal YouTube format shape used for audio picking.
	 */
	private static toMinimalFormat(format: unknown): {
		itag?: number;
		has_audio?: boolean;
		has_video?: boolean;
		mime_type?: string;
		bitrate?: number;
		language?: string | null;
		is_original?: boolean;
		audio_track?: { display_name?: string } | undefined;
	} {
		const f = format as Record<string, unknown>;
		return {
			itag: f?.itag as number | undefined,
			has_audio: f?.has_audio as boolean | undefined,
			has_video: f?.has_video as boolean | undefined,
			mime_type: f?.mime_type as string | undefined,
			bitrate: f?.bitrate as number | undefined,
			language: (f?.language as string | null | undefined) ?? null,
			is_original: f?.is_original as boolean | undefined,
			audio_track: f?.audio_track as { display_name?: string } | undefined,
		};
	}

	/**
	 * @ru Проверяет, является ли MIME тип формата вариантом mp4a.
	 * @en Checks if the format's MIME type is an mp4a variant.
	 */
	private static isMp4aMime(mimeType?: string): boolean {
		return /mp4a/i.test(String(mimeType || ""));
	}

	/**
	 * @ru Выбирает оптимальный аудио-формат: сначала itag 140 по требуемому языку,
	 * затем лучший mp4a по битрейту.
	 * @en Picks best audio format: prefer itag 140 with required language, then best mp4a by bitrate.
	 */
	private pickBestAudioFormat(
		formats: unknown[],
		preferredLanguage: string,
	): ReturnType<typeof YouTubeMusicPlugin.toMinimalFormat> | null {
		const minimal = formats.map(YouTubeMusicPlugin.toMinimalFormat);

		const languageMatch = minimal.find(
			(f) =>
				f?.itag === 140 &&
				f?.has_audio &&
				!f?.has_video &&
				!!f?.audio_track &&
				(f?.language === preferredLanguage ||
					(preferredLanguage === "original" && !!f?.is_original)),
		);
		if (languageMatch) return languageMatch;

		const candidates = minimal
			.filter(
				(f) =>
					f?.has_audio &&
					!f?.has_video &&
					YouTubeMusicPlugin.isMp4aMime(f?.mime_type),
			)
			.sort((a, b) => (b?.bitrate || 0) - (a?.bitrate || 0));

		return candidates[0] ?? null;
	}

	/**
	 * @ru Получает прямой URL из youtubei.js через getStreamingData (с расшифровкой).
	 * @en Resolves a direct URL via youtubei.js getStreamingData (with decipher).
	 */
	private async resolveDirectUrl(
		videoId: string,
		itag?: number,
		language?: string,
		preferMp4a = true,
	): Promise<string | null> {
		const options: any = {
			type: "audio",
			client: "TV",
		};
		if (itag) options.itag = itag;
		if (language) options.language = language;
		if (preferMp4a) options.codec = "mp4a";

		const fmt = await this.yt.getStreamingData(videoId, options);
		const maybeDeciphered =
			typeof (fmt as any).decipher === "function"
				? (fmt as any).decipher()
				: undefined;
		const directUrl = maybeDeciphered || (fmt as any)?.url;
		return typeof directUrl === "string" && directUrl.startsWith("http")
			? directUrl
			: null;
	}

	/**
	 * @ru Инициализирует клиент youtubei.js (однократно), включая локальную сессию и кэш.
	 * @en Lazily initializes youtubei.js client (once), enabling local session and cache.
	 */
	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;
		try {
			this.yt = await Innertube.create({
				cache: new UniversalCache(false),
				// generate_session_locally: true,
				// cookie: buildCookieHeader(cookieString as CookieEntry[]),
			});
			this.initialized = true;
			this.logger.debug("YouTubeMusicPlugin initialized (youtubei.js)");
		} catch (error) {
			this.logger.error(
				`YouTubeMusicPlugin init error: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		}
	}

	/**
	 * @ru Проверяет и нормализует объект трека по схеме.
	 * @en Validates and normalizes a track object against the schema.
	 * @param result Track candidate
	 * @returns Valid track or null
	 */
	private validateTrack(result: SearchTrackResult): SearchTrackResult | null {
		const parsed = TrackResultSchema.safeParse(result);
		if (!parsed.success) {
			this.logger.warn(
				`Invalid YouTube track schema: ${JSON.stringify(parsed.error.issues)}`,
			);
			return null;
		}
		return parsed.data;
	}

	/**
	 * @ru Преобразует данные YouTube в общий формат результата поиска.
	 * @en Maps YouTube data to the unified search result format.
	 */
	private mapToSearchTrackResult(
		videoId: string,
		title: string,
		artistName: string,
	): SearchTrackResult | null {
		return this.validateTrack({
			id: videoId,
			title,
			artists: [{ name: artistName || "Unknown Artist" }],
			albums: [],
			source: "youtube",
		});
	}

	/**
	 * @ru Извлекает идентификатор видео из различных форм URL YouTube.
	 * @en Extracts the video id from different YouTube URL forms.
	 */
	private extractVideoId(url: string): string | null {
		const param = url.match(this.videoIdParam)?.[1];
		if (param) return param;
		const short = url.match(this.shortIdPath)?.[1];
		return short ?? null;
	}

	// /**
	//  * @ru Проверяет, относится ли URL к доменам YouTube/YouTube Music/ youtu.be.
	//  * @en Checks whether the URL belongs to YouTube/YouTube Music/youtu.be domains.
	//  */
	// async includesUrl(url: string): Promise<boolean> {
	// 	try {
	// 		const u = new URL(url);
	// 		return (
	// 			/(^|\.)youtube\.com$/.test(u.hostname) ||
	// 			/(^|\.)music\.youtube\.com$/.test(u.hostname) ||
	// 			/(^|\.)youtu\.be$/.test(u.hostname)
	// 		);
	// 	} catch {
	// 		return false;
	// 	}
	// }

	/**
	 * @ru Выполняет поиск по названию трека на YouTube и возвращает нормализованные результаты.
	 * @en Searches YouTube by track name and returns normalized results.
	 * @param trackName Query string
	 * @returns List of tracks
	 */
	async searchName(trackName: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();
		try {
			const search = await this.yt.search(trackName, { type: "video" });
			const results: SearchTrackResult[] = [];

			for (const item of (search.results ?? []) as unknown[]) {
				const anyItem = item as any;
				const id = anyItem?.id ?? anyItem?.video_id;
				const title = anyItem?.title;
				if (!id || !title) continue;
				const authorName =
					anyItem?.author?.name || anyItem?.author || "Unknown Artist";
				const track = this.mapToSearchTrackResult(
					String(id),
					String(title),
					String(authorName),
				);
				if (track) results.push(track);
			}

			this.logger.debug(
				`[YouTube] Found ${results.length} tracks for: ${trackName}`,
			);
			return results;
		} catch (error) {
			this.logger.error(
				`[YouTube] searchName error: ${error instanceof Error ? error.message : String(error)}`,
			);
			return [];
		}
	}

	/**
	 * @ru Обрабатывает ссылку на видео и возвращает один нормализованный трек, если найден.
	 * @en Processes a video URL and returns a single normalized track if found.
	 * @param url YouTube/YouTube Music URL
	 * @returns Single-item list or empty
	 */
	async searchURL(url: string): Promise<SearchTrackResult[]> {
		await this.ensureInitialized();
		try {
			// Playlist URL
			// const playlistId = this.extractPlaylistId(url);
			// if (playlistId) {
			// 	const items = await this.getPlaylistTracks(playlistId);
			// 	this.logger.debug(
			// 		`[YouTube] Playlist ${playlistId} → ${items.length} items`,
			// 	);
			// 	return items;
			// }

			// Video URL (strip list param if present)
			const sanitizedUrl = this.stripListParam(url);
			const videoId = this.extractVideoId(sanitizedUrl);
			if (!videoId) {
				this.logger.warn(
					`[YouTube] Could not extract video ID from URL: ${url}`,
				);
				return [];
			}

			const info = await this.yt.getInfo(videoId);
			const details = info.basic_info as any;
			const title = String(details?.title ?? "Unknown Title");
			const author = String(
				details?.author ?? details?.channel?.name ?? "Unknown Artist",
			);
			const track = this.mapToSearchTrackResult(videoId, title, author);
			return track ? [track] : [];
		} catch (error) {
			this.logger.error(
				`[YouTube] searchURL error: ${error instanceof Error ? error.message : String(error)} | url=${url}`,
			);
			return [];
		}
	}

	/**
	 * @ru Получает прямой URL аудио (m4a/"mp4a") для видео, учитывая язык дорожки.
	 * @en Retrieves a direct audio URL (m4a/"mp4a") for a video, honoring the desired audio language.
	 * @param trackId YouTube video id
	 * @returns Direct URL string or null
	 */
	async getTrackUrl(trackId: string): Promise<string | null> {
		if (!trackId) {
			this.logger.error("YouTube: getTrackUrl called with empty trackId");
			return null;
		}

		await this.ensureInitialized();
		try {
			const preferredLanguage = this.getPreferredLanguage();

			// Use TV client so that language-specific audio tracks are exposed
			const info = await this.yt.getInfo(trackId, { client: "TV" as any });
			const adaptiveFormatsUnknown =
				(info as any)?.streaming_data?.adaptive_formats ?? [];
			const picked = this.pickBestAudioFormat(
				adaptiveFormatsUnknown,
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

			// Fallback: let youtubei.js choose the best audio automatically
			const autoResolved = await this.resolveDirectUrl(
				trackId,
				undefined,
				preferredLanguage,
				true,
			);
			if (autoResolved) return autoResolved;

			this.logger.warn(
				`[YouTube] No direct audio URL found for ${trackId} (language=${preferredLanguage})`,
			);
			return null;
		} catch (error) {
			this.logger.error(
				`[YouTube] getTrackUrl error: ${error instanceof Error ? error.message : String(error)} | id=${trackId}`,
			);
			return null;
		}
	}

	// Optional helper to fetch playlist tracks
	// private async getPlaylistTracks(
	// 	playlistId: string,
	// ): Promise<SearchTrackResult[]> {
	// 	try {
	// 		const playlist = await this.yt.getPlaylist(playlistId as any);
	// 		const videos: any[] = (playlist as any)?.videos ?? [];
	// 		const results: SearchTrackResult[] = [];

	// 		for (const v of videos) {
	// 			const id = v?.id ?? v?.video_id;
	// 			const title = v?.title;
	// 			if (!id || !title) continue;
	// 			const author = v?.author?.name || v?.author || "Unknown Artist";
	// 			const track = this.mapToSearchTrackResult(
	// 				String(id),
	// 				String(title),
	// 				String(author),
	// 			);
	// 			if (track) results.push(track);
	// 		}
	// 		return results;
	// 	} catch (error) {
	// 		this.logger.error(
	// 			`[YouTube] getPlaylistTracks error: ${error instanceof Error ? error.message : String(error)} | list=${playlistId}`,
	// 		);
	// 		return [];
	// 	}
	// }
}
