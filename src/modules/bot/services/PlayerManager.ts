import { CommandInteraction } from "discord.js";

import { Track } from "../interfaces/index.js";
import { CommandService, PlayerService, QueueService } from "./index.js";
import { bot } from "../bot.js";

/**
 * @en Manages player instances for different Discord guilds
 * @ru Управляет экземплярами плеера для разных Discord-серверов
 */
export default class PlayerManager {
	private readonly players: Map<string, PlayerService> = new Map();
	private readonly queueService: QueueService;
	private readonly commandService: CommandService;
	private readonly logger = bot.logger;

	/**
	 * @en Creates a new PlayerManager instance
	 * @ru Создает новый экземпляр PlayerManager
	 * @param queueService - Service for managing track queues
	 * @param commandService - Service for handling Discord commands
	 */
	constructor(queueService: QueueService, commandService: CommandService) {
		this.queueService = queueService;
		this.commandService = commandService;
	}

	/**
	 * @en Validates that a command is executed within a server context
	 * @ru Проверяет, что команда выполняется в контексте сервера
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
				bot.locale.t("errors.serverError"),
			);
			return null;
		}
		if (!channelId) {
			await this.commandService.send(
				interaction,
				bot.locale.t("errors.serverError"),
			);
			return null;
		}
		handles = { guildId, channelId };
		return handles;
	}

	/**
	 * @en Gets or creates a player instance for a guild
	 * @ru Получает или создает экземпляр плеера для сервера
	 * @param guildId - Discord guild ID
	 * @returns PlayerService instance
	 */
	public getPlayer(guildId: string): PlayerService {
		return (
			this.players.get(guildId) ??
			(() => {
				this.logger.debug(bot.locale.t("player.playerCreated", { guildId }));
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
	 * @en Joins a voice channel
	 * @ru Присоединяется к голосовому каналу
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
	 * @en Plays or queues a track in a guild
	 * @ru Воспроизводит или добавляет трек в очередь на сервере
	 * @param guildId - Discord guild ID
	 * @param track - Track to play or queue
	 */
	public async playOrQueueTrack(guildId: string, track: Track): Promise<void> {
		await this.getPlayer(guildId).playOrQueueTrack(track);
	}

	/**
	 * @en Skips the current track
	 * @ru Пропускает текущий трек
	 * @param interaction - Discord command interaction
	 */
	public async skip(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			await this.getPlayer(handles.guildId).skip(interaction);
		}
	}

	/**
	 * @en Toggles playback pause state
	 * @ru Переключает состояние паузы воспроизведения
	 * @param interaction - Discord command interaction
	 */
	public async togglePause(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			await this.getPlayer(handles.guildId).togglePause(interaction);
		}
	}

	/**
	 * @en Sets player volume
	 * @ru Устанавливает громкость плеера
	 * @param guildId - Discord guild ID
	 * @param volume - Volume level (0-100)
	 */
	public async setVolume(guildId: string, volume: number): Promise<void> {
		if (guildId) {
			this.getPlayer(guildId).setVolume(volume);
		}
	}

	/**
	 * @en Sets player loop state
	 * @ru Устанавливает состояние повтора плеера
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
	 * @en Sets player wave state
	 * @ru Устанавливает состояние волны плеера
	 * @param guildId - Discord guild ID
	 * @param wave - Wave state
	 */
	public async setWave(guildId: string, wave: boolean): Promise<void> {
		if (guildId) {
			this.getPlayer(guildId).state.wave = wave;
			this.queueService.setWave(guildId, wave);
		}
	}

	/**
	 * @en Disconnects from voice channel and removes player instance
	 * @ru Отключается от голосового канала и удаляет экземпляр плеера
	 * @param guildId - Discord guild ID
	 */
	public async leaveChannel(guildId: string): Promise<void> {
		const player = this.players.get(guildId);
		if (!player) {
			this.logger.warn(bot.locale.t("errors.playerNotFound", { guildId }));
			return;
		}

		await player.destroy();
		player.leaveChannel();
		this.players.delete(guildId);
	}

	/**
	 * @en Destroys all player instances and clears the map
	 * @ru Уничтожает все экземпляры плеера и очищает карту
	 */
	public async destroyAll(): Promise<void> {
		for (const [, player] of this.players) {
			await player.destroy();
			player.leaveChannel();
		}
		this.players.clear();
	}
}
