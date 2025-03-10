import { CommandInteraction } from "discord.js";

import { Track } from "../interfaces/index.js";
import { CommandService, PlayerService, QueueService } from "./index.js";
import { bot } from "../bot.js";

/**
 * Manages player instances for different Discord guilds
 */
export default class PlayerManager {
	private readonly players: Map<string, PlayerService> = new Map();
	private readonly queueService: QueueService;
	private readonly commandService: CommandService;
	private readonly logger = bot.logger;

	/**
	 * Creates a new PlayerManager instance
	 * @param queueService - Service for managing track queues
	 * @param commandService - Service for handling Discord commands
	 */
	constructor(queueService: QueueService, commandService: CommandService) {
		this.queueService = queueService;
		this.commandService = commandService;
	}

	/**
	 * Validates that a command is executed within a server context
	 * @param interaction - Discord command interaction
	 * @returns Guild ID if command is valid, null otherwise
	 */
	private async handleServerOnlyCommand(
		interaction: CommandInteraction,
	): Promise<{ guildId: string; channelId: string } | null> {
		const { guildId, channelId } = interaction;
		var handles = undefined;
		if (!guildId) {
			await this.commandService.send(
				interaction, 
				bot.locale.t('errors.serverError')
			);
			return null;
		}
		if (!channelId) {
			await this.commandService.send(
				interaction, 
				bot.locale.t('errors.serverError')
			);
			return null;
		}
		handles = { guildId, channelId };
		return handles;
	}

	/**
	 * Gets or creates a player instance for a guild
	 * @param guildId - Discord guild ID
	 * @returns PlayerService instance
	 */
	public getPlayer(guildId: string): PlayerService {
		return (
			this.players.get(guildId) ??
			(() => {
				this.logger.debug(
					bot.locale.t('player.playerCreated', { guildId })
				);
				const newPlayer = new PlayerService(
					this.queueService,
					this.commandService,
					guildId,
				);
				this.players.set(guildId, newPlayer);
				return newPlayer;
			})()
		);
	}

	/**
	 * Joins a voice channel
	 * @param interaction - Discord command interaction
	 */
	public async joinChannel(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			const player = this.getPlayer(handles.guildId);
			await player.joinChannel(interaction);
		}
	}

	/**
	 * Plays or queues a track in a guild
	 * @param guildId - Discord guild ID
	 * @param track - Track to play or queue
	 */
	public async playOrQueueTrack(guildId: string, track: Track): Promise<void> {
		await this.getPlayer(guildId).playOrQueueTrack(track);
	}

	/**
	 * Skips the current track
	 * @param interaction - Discord command interaction
	 */
	public async skip(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			await this.getPlayer(handles.guildId).skip(interaction);
		}
	}

	/**
	 * Toggles playback pause state
	 * @param interaction - Discord command interaction
	 */
	public async togglePause(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			await this.getPlayer(handles.guildId).togglePause(interaction);
		}
	}

	/**
	 * Sets player volume
	 * @param guildId - Discord guild ID
	 * @param volume - Volume level (0-100)
	 */
	public async setVolume(guildId: string, volume: number): Promise<void> {
		if (guildId) {
			this.getPlayer(guildId).setVolume(volume);
		}
	}

	/**
	 * Sets player loop state
	 * @param guildId - Discord guild ID
	 * @param channelId - Discord channel ID
	 * @param loop - Loop state
	 */
	public async setLoop(guildId: string, loop: boolean): Promise<void> {
		if (guildId) {
			this.getPlayer(guildId).state.loop = loop;
			this.queueService.setLoop(guildId, loop);
		}
	}

	/**
	 * Disconnects from voice channel and removes player instance
	 * @param guildId - Discord guild ID
	 */
	public leaveChannel(guildId: string): void {
		const player = this.players.get(guildId);
		if (!player) {
			this.logger.warn(
				bot.locale.t('errors.playerNotFound', { guildId })
			);
			return;
		}

		player.leaveChannel();
		this.players.delete(guildId);
	}
}
