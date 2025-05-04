import { type CommandInteraction, type GuildMember } from "discord.js";
import { z } from "zod";
import {
	PluginNotFoundError,
	UserNotInVoiceChannelError,
} from "../errors/index.js";
import type { MusicServicePlugin } from "../interfaces/index.js";
import { trackPlayCounter } from "../utils/index.js";
import {
	type PlayerManager,
	type PluginManager,
	type SearchTrackResult,
	type Track,
} from "./index.js";
import { bot } from "../bot.js";

const TrackUrlSchema = z.string().url();

/**
 * Service for searching and processing music tracks
 * @en Handles track search, URL processing and playlist management
 * @ru Сервис для поиска и обработки музыкальных треков
 */
export default class NameService {
	/**
	 * @en Creates a new instance of NameService
	 * @ru Создает новый экземпляр NameService
	 * @param queueService Queue service instance
	 * @param playerManager Player manager instance
	 * @param pluginManager Plugin manager instance
	 */
	constructor(
		private readonly queueService = bot.queueService,
		private readonly playerManager: PlayerManager,
		private readonly pluginManager: PluginManager,
	) {}

	private readonly logger = bot.logger;
	private readonly locale = bot.locale;

	/**
	 * @en Searches for a track by name or processes URL
	 * @ru Ищет трек по имени или обрабатывает URL
	 * @param trackName Track name or URL to search
	 * @returns Promise with search results
	 */
	async searchName(trackName: string): Promise<SearchTrackResult[]> {
		const TIMEOUT_MS = 2500; // 2.5 секунды на запрос
		const trimmedName = trackName.trim();

		if (!trimmedName) return [];

		try {
			// Добавляем таймаут для всего запроса
			const result = await Promise.race([
				TrackUrlSchema.safeParse(trimmedName).success
					? this.searchAndProcessURL(trimmedName)
					: this.searchAcrossPlugins(trimmedName),
				new Promise<SearchTrackResult[]>((_, reject) =>
					setTimeout(() => reject(new Error("Search timeout")), TIMEOUT_MS),
				),
			]);

			this.logger.debug(`Found ${result.length} results for: ${trimmedName}`);
			return result;
		} catch (error) {
			this.logger.error(`Search failed for "${trimmedName}":`, error);
			return [];
		}
	}

	/**
	 * @en Processes track URL and handles playlist detection
	 * @ru Обрабатывает URL трека и определяет плейлисты
	 * @param url Track URL to process
	 * @param track Search results
	 * @param interaction Command interaction
	 */
	async trackAndUrl(
		url: string,
		track: SearchTrackResult[],
		interaction: CommandInteraction,
	) {
		const plugin = bot.pluginManager.getPlugin(track[0].source);
		if (!plugin) {
			this.logger.error(
				this.locale.t("messages.nameService.errors.plugin_not_found", {
					source: track[0].source,
				}),
			);
			return;
		}

		if (plugin.includesUrl) {
			const includesUrl = await plugin.includesUrl(url);
			if (includesUrl) {
				await this.processPlaylist(url, interaction);
			} else {
				await this.processTrackSelection(track[0], interaction);
			}
		} else {
			await this.processTrackSelection(track[0], interaction);
		}
	}

	/**
	 * @en Processes selected track and adds it to queue
	 * @ru Обрабатывает выбранный трек и добавляет его в очередь
	 * @param selectedTrack Track to process
	 * @param interaction Command interaction
	 */
	async processTrackSelection(
		selectedTrack: SearchTrackResult,
		interaction: CommandInteraction,
	): Promise<void> {
		try {
			const { guildId } = this.getVoiceChannelInfo(interaction);
			const track = this.createTrackInfo(selectedTrack, interaction, true);

			await this.addTrackToQueue(track, guildId, interaction);
			trackPlayCounter.inc({ status: "success" });
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.nameService.errors.track_processing", {
					error: error instanceof Error ? error.message : String(error),
				}),
				error,
			);
			await bot.commandService.reply(
				interaction,
				"messages.nameService.errors.track_processing",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	/**
	 * @en Adds track to playback queue
	 * @ru Добавляет трек в очередь воспроизведения
	 * @param track Track to add
	 * @param guildId Guild ID
	 * @param interaction Command interaction
	 */
	private async addTrackToQueue(
		track: Track,
		guildId: string,
		interaction: CommandInteraction,
	): Promise<void> {
		await bot.commandService.reply(
			interaction,
			"messages.nameService.success.added_to_queue",
			{
				track: track.info,
			},
		);

		await Promise.all([
			this.playerManager.playOrQueueTrack(guildId, track) || null,
			this.playerManager.joinChannel(interaction) || null,
		]);
	}

	/**
	 * @en Processes playlist URL and adds tracks to queue
	 * @ru Обрабатывает URL плейлиста и добавляет треки в очередь
	 * @param url Playlist URL
	 * @param interaction Command interaction
	 */
	async processPlaylist(
		url: string,
		interaction: CommandInteraction,
	): Promise<SearchTrackResult[] | void> {
		let tracks: SearchTrackResult[] = [];

		try {
			const { guildId } = this.getVoiceChannelInfo(interaction);
			tracks = await this.searchAndProcessURL(url);

			if (!tracks.length) {
				throw new Error(
					bot.locale.t("messages.nameService.errors.empty_playlist"),
				);
			}

			await bot.commandService.reply(
				interaction,
				"messages.nameService.success.playlist_added",
			);

			await this.addPlaylistTracksToQueue(
				tracks,
				guildId,
				interaction.user.id,
				interaction,
			);

			return tracks;
		} catch (error) {
			await this.handleError(error);
		} finally {
			tracks = [];
		}
	}

	/**
	 * @en Searches for a track across all plugins
	 * @ru Ищет трек во всех плагинах
	 * @param trackName Track name to search
	 * @returns Promise with search results
	 */
	private async searchAcrossPlugins(
		trackName: string,
	): Promise<SearchTrackResult[]> {
		const results = await Promise.allSettled(
			this.pluginManager
				.getAllPlugins()
				.map((plugin) => this.searchWithPlugin(plugin, trackName)),
		);

		return results
			.filter(
				(result): result is PromiseFulfilledResult<SearchTrackResult[]> =>
					result.status === "fulfilled",
			)
			.flatMap((result) => result.value)
			.filter(Boolean);
	}

	/**
	 * @en Searches for a track using a specific plugin
	 * @ru Ищет трек с помощью определенного плагина
	 * @param plugin Music service plugin
	 * @param trackName Track name to search
	 * @returns Promise with search results
	 */
	private async searchWithPlugin(
		plugin: MusicServicePlugin,
		trackName: string,
	): Promise<SearchTrackResult[] | null> {
		try {
			const timeoutPromise = new Promise<SearchTrackResult[]>((_, reject) => {
				setTimeout(() => reject(new Error("Search timeout")), 10000); // 10 секунд
			});

			return await Promise.race([plugin.searchName(trackName), timeoutPromise]);
		} catch (error) {
			this.logger.warn(
				this.locale.t("messages.nameService.errors.search_error", {
					plugin: plugin.name,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	/**
	 * @en Searches and processes a track URL
	 * @ru Ищет и обрабатывает URL трека
	 * @param url URL to process
	 * @returns Promise with search results
	 */
	private async searchAndProcessURL(url: string): Promise<SearchTrackResult[]> {
		const plugin = this.pluginManager.getPluginForUrl(url);
		if (!plugin) throw new PluginNotFoundError(url);

		try {
			const result = await plugin.searchURL(url);
			return Array.isArray(result) ? result : [];
		} catch (error) {
			this.logger.warn(
				this.locale.t("messages.nameService.errors.url_processing", {
					plugin: plugin.name,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	/**
	 * @en Adds playlist tracks to queue in batches
	 * @ru Добавляет треки плейлиста в очередь пакетами
	 * @param tracks List of track search results
	 * @param guildId Guild ID
	 * @param requestedBy ID of the user who requested
	 * @param interaction Command interaction
	 */
	private async addPlaylistTracksToQueue(
		tracks: SearchTrackResult[],
		guildId: string,
		requestedBy?: string,
		interaction?: CommandInteraction,
	): Promise<void> {
		const BATCH_SIZE = 100;

		for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
			const batchTracks = tracks.slice(i, i + BATCH_SIZE);
			const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
			const totalBatches = Math.ceil(tracks.length / BATCH_SIZE);

			this.logger.debug(
				this.locale.t("messages.nameService.success.processing_batch", {
					current: currentBatch,
					total: totalBatches,
					batchSize: batchTracks.length,
				}),
			);

			await this.processPlaylistTrack(batchTracks, guildId, requestedBy);

			if (i + BATCH_SIZE < tracks.length) {
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
		}

		if (interaction) {
			await this.playerManager.joinChannel(interaction);
		}
	}

	/**
	 * @en Processes playlist track and adds it to queue
	 * @ru Обрабатывает трек плейлиста и добавляет его в очередь
	 * @param tracks Array of track search results
	 * @param guildId Guild ID
	 * @param requestedBy ID of user who requested
	 */
	private async processPlaylistTrack(
		tracks: SearchTrackResult[],
		guildId: string,
		requestedBy?: string,
	): Promise<void> {
		const plugin = this.pluginManager.getPlugin(tracks[0].source);
		if (!plugin?.getTrackUrl) return;

		// Ограничиваем размер пакета
		const BATCH_SIZE = 20;

		// Преобразуем все треки
		const transformedTracks: Omit<Track, "id">[] = tracks.map((track) => {
			return {
				trackId: track.id,
				info: this.formatTrackInfo(track) || "Unknown Track",
				source: track.source || "unknown",
				priority: false,
				...(requestedBy && { requestedBy }),
			};
		});

		// Обрабатываем треки пакетами
		for (let i = 0; i < transformedTracks.length; i += BATCH_SIZE) {
			const batch = transformedTracks.slice(i, i + BATCH_SIZE);
			await this.queueService.setTracks(guildId, batch);

			// Даем системе время освободить ресурсы между пакетами
			if (i + BATCH_SIZE < transformedTracks.length) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}
	}

	/**
	 * @en Formats track information for display
	 * @ru Форматирует информацию о треке для отображения
	 * @param track Track search result
	 * @returns Formatted track info string
	 */
	private formatTrackInfo(track: SearchTrackResult): string {
		return `${track.artists.map((a) => a.name).join(", ")} - ${track.title}`;
	}

	/**
	 * @en Gets voice channel info from interaction
	 * @ru Получает информацию о голосовом канале из взаимодействия
	 * @param interaction Command interaction
	 * @throws UserNotInVoiceChannelError
	 * @returns Channel and guild IDs
	 */
	private getVoiceChannelInfo(interaction: CommandInteraction): {
		channelId: string;
		guildId: string;
	} {
		const member = interaction.member as GuildMember;
		const channelId = member.voice?.channelId;
		const guildId = member.guild?.id;

		if (!channelId || !guildId) {
			throw new UserNotInVoiceChannelError();
		}

		return { channelId, guildId };
	}

	/**
	 * @en Creates track info object
	 * @ru Создает объект с информацией о треке
	 * @param track Source track data
	 * @param interaction Command interaction
	 * @param isPriority Priority flag
	 * @returns Track info object
	 */
	private createTrackInfo(
		track: SearchTrackResult,
		interaction: CommandInteraction,
		isPriority = false,
	): Track {
		return {
			trackId: track.id,
			info: this.formatTrackInfo(track),
			source: track.source,
			priority: isPriority,
			requestedBy: interaction.user.id,
		};
	}

	/**
	 * @en Handles errors and logs them
	 * @ru Обрабатывает и логирует ошибки
	 * @param error Error object
	 */
	private async handleError(error: unknown): Promise<void> {
		bot.logger.error(
			bot.locale.t("messages.nameService.errors.track_processing", {
				error: error instanceof Error ? error.message : String(error),
			}),
			error,
		);
	}
}
