import {
	MessageFlags,
	type CommandInteraction,
	type GuildMember,
} from "discord.js";
import { z } from "zod";

import {
	PluginNotFoundError,
	UserNotInVoiceChannelError,
} from "../errors/index.js";
import type { MusicServicePlugin } from "../interfaces/index.js";
import { trackPlayCounter } from "../utils/index.js";
import type {
	PlayerManager,
	PluginManager,
	SearchTrackResult,
	Track,
} from "./index.js";
import { bot } from "../bot.js";

// Улучшенная схема валидации с использованием Zod
const TrackUrlSchema = z.string().url();

// Константы вынесены для лучшей читаемости
const BATCH_SIZE = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Сервис для поиска и обработки музыкальных треков
 */
export default class NameService {
	constructor(
		private readonly queueService = bot.queueService,
		private readonly playerManager: PlayerManager,
		private readonly pluginManager: PluginManager,
	) {}

	private readonly logger = bot.logger;
	private readonly locale = bot.locale;

	/**
	 * Ищет трек или URL
	 */
	async searchName(trackName: string): Promise<SearchTrackResult[]> {
		this.logger.debug(
			this.locale.t("messages.nameService.info.searching_track", {
				query: trackName,
			}),
		);
		const trimmedName = trackName.trim();
		if (!trimmedName) return [];

		// Используем Zod для валидации URL
		return TrackUrlSchema.safeParse(trimmedName).success
			? this.searchAndProcessURL(trimmedName)
			: this.searchAcrossPlugins(trimmedName);
	}

	/**
	 * Обрабатывает трек и URL
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

		// Исправляем условие для проверки includesUrl
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
	 * Обрабатывает выбор трека и добавляет его в очередь
	 */
	async processTrackSelection(
		selectedTrack: SearchTrackResult,
		interaction: CommandInteraction,
	): Promise<void> {
		try {
			if (!interaction.deferred) {
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			}

			const { guildId } = this.getVoiceChannelInfo(interaction);
			const track = this.createTrackInfo(selectedTrack, interaction, true);

			await this.addTrackToQueue(track, guildId, interaction);
			trackPlayCounter.inc({ status: "success" });
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.nameService.errors.track_processing", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);

			if (!interaction.replied && interaction.isRepliable()) {
				await interaction.editReply({
					content: this.locale.t("errors.track.processing"),
				});
			}
		}
	}

	/**
	 * Добавляет трек в очередь
	 */
	private async addTrackToQueue(
		track: Track,
		guildId: string,
		interaction: CommandInteraction,
	): Promise<void> {
		await bot.commandService.reply(
			interaction,
			this.locale.t("messages.nameService.success.added_to_queue", {
				track: track.info,
			}),
		);

		// Используем Promise.all для параллельного выполнения
		await Promise.all([
			this.playerManager.playOrQueueTrack(guildId, track),
			this.queueService.getLastTrackID(guildId),
			this.playerManager.joinChannel(interaction),
		]);
	}

	/**
	 * Обрабатывает URL плейлиста и добавляет его треки в очередь
	 */
	async processPlaylist(
		url: string,
		interaction: CommandInteraction,
	): Promise<SearchTrackResult[] | void> {
		try {
			const { guildId } = this.getVoiceChannelInfo(interaction);
			const tracks = await this.searchAndProcessURL(url);

			if (!tracks.length)
				throw new Error(
					bot.locale.t("messages.nameService.errors.empty_playlist"),
				);
			await bot.commandService.reply(
				interaction,
				bot.locale.t("messages.nameService.success.playlist_added"),
			);

			// Используем Promise.all для параллельного выполнения
			await this.addPlaylistTracksToQueue(
				tracks,
				guildId,
				interaction.user.id,
				interaction,
			);

			return tracks;
		} catch (error) {
			await this.handleError(error, interaction);
		}
	}

	/**
	 * Ищет трек во всех плагинах
	 */
	private async searchAcrossPlugins(
		trackName: string,
	): Promise<SearchTrackResult[]> {
		// Используем Promise.allSettled для обработки ошибок отдельных плагинов
		const results = await Promise.allSettled(
			this.pluginManager
				.getAllPlugins()
				.map((plugin) => this.searchWithPlugin(plugin, trackName)),
		);

		// Обрабатываем результаты, игнорируя отклоненные промисы
		return results
			.filter(
				(result): result is PromiseFulfilledResult<SearchTrackResult[]> =>
					result.status === "fulfilled",
			)
			.flatMap((result) => result.value)
			.filter(Boolean);
	}

	/**
	 * Ищет трек с помощью определенного плагина
	 */
	private async searchWithPlugin(
		plugin: MusicServicePlugin,
		trackName: string,
	): Promise<SearchTrackResult[]> {
		try {
			return await plugin.searchName(trackName);
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
	 * Ищет и обрабатывает URL
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
	 * Добавляет треки плейлиста в очередь с использованием setTimeout
	 */
	private async addPlaylistTracksToQueue(
		tracks: SearchTrackResult[],
		guildId: string,
		requestedBy?: string,
		interaction?: CommandInteraction,
	): Promise<void> {
		// Используем chunking для обработки больших плейлистов
		for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
			await Promise.all(
				tracks
					.slice(i, i + BATCH_SIZE)
					.map((track) =>
						this.processPlaylistTrack(track, guildId, requestedBy),
					),
			);
			// Используем setTimeout вместо Bun.sleep
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		if (interaction) {
			await this.playerManager.joinChannel(interaction);
		}
	}

	/**
	 * Обрабатывает трек плейлиста и добавляет его в очередь
	 */
	private async processPlaylistTrack(
		track: SearchTrackResult,
		guildId: string,
		requestedBy?: string,
	): Promise<void> {
		const plugin = this.pluginManager.getPlugin(track.source);
		if (!plugin?.getTrackUrl) return;

		const trackInfo: Track = {
			trackId: track.id,
			info: this.formatTrackInfo(track),
			source: track.source,
			priority: false,
			...(requestedBy && { requestedBy }),
		};

		// Используем retry с экспоненциальной задержкой
		for (let retries = 0; retries < MAX_RETRIES; retries++) {
			try {
				await this.queueService.setTrack(guildId, trackInfo);
				return;
			} catch (error) {
				if (retries === MAX_RETRIES - 1) {
					this.logger.error(
						this.locale.t("messages.nameService.errors.add_track_failed", {
							id: track.id,
							retries: MAX_RETRIES,
							error: error instanceof Error ? error.message : String(error),
						}),
					);
				} else {
					// Используем setTimeout с экспоненциальной задержкой
					await new Promise((resolve) =>
						setTimeout(resolve, RETRY_DELAY * Math.pow(2, retries)),
					);
				}
			}
		}
	}

	/**
	 * Форматирует информацию о треке
	 */
	private formatTrackInfo(track: SearchTrackResult): string {
		return `${track.artists.map((a) => a.name).join(", ")} - ${track.title}`;
	}

	/**
	 * Извлекает информацию о голосовом канале из взаимодействия
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
	 * Создает информацию о треке
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
	 * Обрабатывает ошибку
	 */
	private async handleError(
		error: unknown,
		interaction: CommandInteraction,
	): Promise<void> {
		bot.logger.error(
			bot.locale.t("messages.nameService.errors.track_processing", {
				error: error instanceof Error ? error.message : String(error),
			}),
			error,
		);
		await bot.commandService.reply(interaction, this.getErrorMessage(error));
	}

	/**
	 * Извлекает сообщение об ошибке
	 */
	private getErrorMessage(error: unknown): string {
		if (error instanceof UserNotInVoiceChannelError)
			return bot.locale.t("errors.notInVoiceChannel", {
				error: error instanceof Error ? error.message : String(error),
			});

		if (error instanceof PluginNotFoundError)
			return bot.locale.t("errors.unsupported_track_source", {
				error: error instanceof Error ? error.message : String(error),
			});
		return bot.locale.t("errors.unexpectedError");
	}
}
