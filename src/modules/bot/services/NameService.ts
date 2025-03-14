import type { CommandInteraction, GuildMember } from "discord.js";
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
	QueueService,
	SearchTrackResult,
	Track,
} from "./index.js";
import { bot } from "../bot.js";

const TrackUrlSchema = z.string().url();
const BATCH_SIZE = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export default class NameService {
	constructor(
		private readonly queueService: QueueService,
		private readonly playerManager: PlayerManager,
		private readonly pluginManager: PluginManager,
	) {}

	/**
	 * Searches for a track or URL
	 * @param {string} trackName - Track name or URL
	 * @returns {Promise<SearchTrackResult[]>} Array of search results
	 */
	async searchName(trackName: string): Promise<SearchTrackResult[]> {
		bot.logger.debug(
			bot.locale.t("messages.nameService.info.searching_track", {
				query: trackName,
			}),
		);
		const trimmedName = trackName.trim();
		if (!trimmedName) return [];

		return TrackUrlSchema.safeParse(trimmedName).success
			? this.searchAndProcessURL(trimmedName)
			: this.searchAcrossPlugins(trimmedName);
	}

	async trackAndUrl(
		url: string,
		track: SearchTrackResult[],
		interaction: CommandInteraction,
	) {
		const plugin = bot.pluginManager.getPlugin(track[0].source);
		if (!plugin) {
			bot.logger.error(
				bot.locale.t("messages.nameService.errors.plugin_not_found", {
					source: track[0].source,
				}),
			);
			return;
		}

		if (plugin.includesUrl && (await plugin.includesUrl(url))) {
			await bot.nameService.processPlaylist(url, interaction);
		} else {
			await bot.nameService.processTrackSelection(track[0], interaction);
		}
	}

	/**
	 * Processes track selection and adds it to the queue
	 * @param {SearchTrackResult} selectedTrack - Selected track information
	 * @param {CommandInteraction} interaction - Discord command interaction
	 */
	async processTrackSelection(
		selectedTrack: SearchTrackResult,
		interaction: CommandInteraction,
	): Promise<void> {
		try {
			if (!interaction.deferred) {
				await interaction.deferReply({ ephemeral: true });
			}
			
			const { guildId } = this.getVoiceChannelInfo(interaction);
			const track = this.createTrackInfo(selectedTrack, interaction, true);

			await this.addTrackToQueue(track, guildId, interaction);
			trackPlayCounter.inc({ status: "success" });
		} catch (error) {
			bot.logger.error(
				bot.locale.t("messages.nameService.errors.track_processing", {
					error: error instanceof Error ? error.message : String(error),
				})
			);
			
			if (!interaction.replied && interaction.isRepliable()) {
				await interaction.editReply({
					content: bot.locale.t("errors.track.processing")
				});
			}
		}
	}

	/**
	 * Adds a track to the queue
	 * @param {Track} track - Track information
	 * @param {string} guildId - Guild ID
	 * @param {CommandInteraction} interaction - Discord command interaction
	 */
	private async addTrackToQueue(
		track: Track,
		guildId: string,
		interaction: CommandInteraction,
	): Promise<void> {
		await bot.commandService.reply(
			interaction,
			bot.locale.t("messages.nameService.success.added_to_queue", {
				track: track.info,
			}),
		);

		await Promise.all([
			this.playerManager.playOrQueueTrack(guildId, track),
			this.queueService.getLastTrackID(guildId),
			this.playerManager.joinChannel(interaction),
		]);
	}

	/**
	 * Processes a playlist URL and adds its tracks to the queue
	 * @param {string} url - Playlist URL
	 * @param {CommandInteraction} interaction - Discord command interaction
	 * @returns {Promise<SearchTrackResult[] | void>} Array of tracks or void if an error occurs
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

			await Promise.all([
				this.addPlaylistTracksToQueue(
					tracks,
					guildId,
					interaction.user.id,
					interaction,
				),
			]);

			return tracks;
		} catch (error) {
			await this.handleError(error, interaction);
		}
	}

	/**
	 * Searches across all plugins for a track
	 * @param {string} trackName - Track name
	 * @returns {Promise<SearchTrackResult[]>} Array of search results
	 */
	private async searchAcrossPlugins(
		trackName: string,
	): Promise<SearchTrackResult[]> {
		const results = await Promise.all(
			this.pluginManager
				.getAllPlugins()
				.map((plugin) => this.searchWithPlugin(plugin, trackName)),
		);
		return results.flat().filter(Boolean);
	}

	/**
	 * Searches with a specific plugin for a track
	 * @param {MusicServicePlugin} plugin - Plugin to search with
	 * @param {string} trackName - Track name
	 * @returns {Promise<SearchTrackResult[]>} Array of search results
	 */
	private async searchWithPlugin(
		plugin: MusicServicePlugin,
		trackName: string,
	): Promise<SearchTrackResult[]> {
		try {
			return await plugin.searchName(trackName);
		} catch (error) {
			bot.logger.warn(
				bot.locale.t("messages.nameService.errors.search_error", {
					plugin: plugin.name,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	/**
	 * Searches and processes a URL
	 * @param {string} url - URL to search
	 * @returns {Promise<SearchTrackResult[]>} Array of search results
	 */
	private async searchAndProcessURL(url: string): Promise<SearchTrackResult[]> {
		const plugin = this.pluginManager.getPluginForUrl(url);
		if (!plugin) throw new PluginNotFoundError(url);

		try {
			const result = await plugin.searchURL(url);
			return Array.isArray(result) ? result : [];
		} catch (error) {
			bot.logger.warn(
				bot.locale.t("messages.nameService.errors.url_processing", {
					plugin: plugin.name,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	/**
	 * Adds playlist tracks to the queue
	 * @param {SearchTrackResult[]} tracks - Array of tracks
	 * @param {string} guildId - Guild ID
	 * @param {string} requestedBy - Requested by user ID
	 * @param {CommandInteraction} interaction - Discord command interaction
	 */
	private async addPlaylistTracksToQueue(
		tracks: SearchTrackResult[],
		guildId: string,
		requestedBy?: string,
		interaction?: CommandInteraction,
	): Promise<void> {
		for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
			await Promise.all(
				tracks
					.slice(i, i + BATCH_SIZE)
					.map((track) =>
						this.processPlaylistTrack(track, guildId, requestedBy),
					),
			);
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		if (interaction) {
			this.playerManager.joinChannel(interaction);
		}
	}

	/**
	 * Processes a playlist track and adds it to the queue
	 * @param {SearchTrackResult} track - Track information
	 * @param {string} guildId - Guild ID
	 * @param {string} requestedBy - Requested by user ID
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

		for (let retries = 0; retries < MAX_RETRIES; retries++) {
			try {
				await this.queueService.setTrack(guildId, trackInfo);
				return;
			} catch (error) {
				if (retries === MAX_RETRIES - 1) {
					bot.logger.error(
						bot.locale.t("messages.nameService.errors.add_track_failed", {
							id: track.id,
							retries: MAX_RETRIES,
							error: error instanceof Error ? error.message : String(error),
						}),
					);
				} else {
					await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
				}
			}
		}
	}

	/**
	 * Formats track information
	 * @param {SearchTrackResult} track - Track information
	 * @returns {string} Formatted track information
	 */
	private formatTrackInfo(track: SearchTrackResult): string {
		return `${track.artists.map((a) => a.name).join(", ")} - ${track.title}`;
	}

	/**
	 * Retrieves voice channel information from an interaction
	 * @param {CommandInteraction} interaction - Discord command interaction
	 * @returns {Object} Voice channel information
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
	 * Creates track information
	 * @param {SearchTrackResult} track - Track information
	 * @param {CommandInteraction} interaction - Discord command interaction
	 * @param {boolean} isPriority - Whether the track is priority
	 * @returns {Track} Track information
	 */
	private createTrackInfo(
		track: SearchTrackResult,
		interaction: CommandInteraction,
		isPriority: boolean = false,
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
	 * Handles an error
	 * @param {unknown} error - Error
	 * @param {CommandInteraction} interaction - Discord command interaction
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
	 * Retrieves an error message
	 * @param {unknown} error - Error
	 * @returns {string} Error message
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
