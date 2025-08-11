import type { CommandInteraction } from "discord.js";

import type { Track } from "../../interfaces/index.js";
import { type CommandService, PlayerService } from "../index.js";
import { bot } from "../../bot.js";

/**
 * @en Manages player instances for different Discord servers
 * @ru Управляет экземплярами плеера для разных Discord-серверов
 */
export default class PlayerManager {
	private readonly players: Map<string, PlayerService> = new Map();
	private readonly queueService = bot.queueService;
	private readonly commandService: CommandService;
	private readonly logger = bot.logger;
	private readonly bot = bot;

	private readonly playerCache = new Map<
		string,
		{ lastUsed: number; player: PlayerService }
	>();
	private readonly CACHE_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 минут

	/**
	 * @en Creates a new PlayerManager instance
	 * @ru Создает новый экземпляр PlayerManager
	 * @param queueService Queue service instance
	 * @param commandService Command service instance
	 */
	constructor(queueService = bot.queueService, commandService: CommandService) {
		this.queueService = queueService;
		this.commandService = commandService;

		// Запускаем периодическую очистку кэша
		this.startCacheCleanup();
	}

	/**
	 * @en Starts periodic cleanup of unused players cache
	 * @ru Запускает периодическую очистку кэша неиспользуемых плееров
	 */
	private startCacheCleanup(): void {
		setInterval(() => {
			const now = Date.now();
			const expiredTime = now - 3600000; // 1 час неактивности

			for (const [guildId, cacheEntry] of this.playerCache.entries()) {
				if (cacheEntry.lastUsed < expiredTime) {
					this.logger.debug(
						`Removing inactive player for guild ${guildId} from cache`,
					);
					this.playerCache.delete(guildId);

					// Если плеер не используется активно, уничтожаем его
					if (!this.players.has(guildId)) {
						cacheEntry.player.destroy();
					}
				}
			}
		}, this.CACHE_CLEANUP_INTERVAL);
	}

	/**
	 * @en Checks that command is executed in server context
	 * @ru Проверяет, что команда выполняется в контексте сервера
	 * @param interaction Command interaction
	 * @returns Object with guild and channel IDs or null
	 */
	private async handleServerOnlyCommand(
		interaction: CommandInteraction,
	): Promise<{ guildId: string; channelId: string } | null> {
		const { guildId, channelId } = interaction;

		if (!guildId) {
			await this.commandService.reply(
				interaction,
				"messages.playerManager.errors.server_error",
			);
			return null;
		}
		if (!channelId) {
			await this.commandService.reply(
				interaction,
				"messages.playerManager.errors.server_error",
			);
			return null;
		}

		return { guildId, channelId };
	}

	/**
	 * @en Gets or creates a player instance for a guild
	 * @ru Получает или создает экземпляр плеера для сервера
	 * @param guildId Discord guild ID
	 * @returns Player service instance
	 */
	public getPlayer(guildId: string): PlayerService {
		// Проверяем активные плееры
		if (this.players.has(guildId)) {
			const player = this.players.get(guildId)!;

			// Обновляем время последнего использования в кэше
			if (this.playerCache.has(guildId)) {
				this.playerCache.get(guildId)!.lastUsed = Date.now();
			}

			return player;
		}

		// Проверяем кэш
		if (this.playerCache.has(guildId)) {
			const cacheEntry = this.playerCache.get(guildId)!;
			cacheEntry.lastUsed = Date.now();

			// Восстанавливаем плеер из кэша
			this.players.set(guildId, cacheEntry.player);
			this.logger.debug(`Restored player for guild ${guildId} from cache`);

			return cacheEntry.player;
		}

		// Создаем новый плеер
		this.logger.debug(
			bot.locale.t("messages.playerManager.player.player_created", { guildId }),
		);
		const newPlayer = new PlayerService(guildId, this.bot);

		// Сохраняем в активные плееры и кэш
		this.players.set(guildId, newPlayer);
		this.playerCache.set(guildId, {
			player: newPlayer,
			lastUsed: Date.now(),
		});

		return newPlayer;
	}

	/**
	 * @en Joins a voice channel
	 * @ru Присоединяется к голосовому каналу
	 * @param interaction Command interaction
	 */
	public async joinChannel(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			const player = this.getPlayer(handles.guildId);
			await player.joinChannel(interaction);
		}
	}

	/**
	 * @en Plays or queues a track on the guild
	 * @ru Воспроизводит или добавляет трек в очередь на сервере
	 * @param guildId Discord guild ID
	 * @param track Track to play or queue
	 */
	public async playOrQueueTrack(
		guildId: string,
		track: Track,
		interaction: CommandInteraction,
	): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			await this.getPlayer(guildId).playOrQueueTrack(track);
		}
	}

	/**
	 * @en Skips the current track
	 * @ru Пропускает текущий трек
	 * @param guildId Discord guild ID
	 */
	public async skip(guildId: string): Promise<void> {
		if (guildId) {
			await this.getPlayer(guildId).skip();
		}
	}

	/**
	 * @en Toggles playback pause state
	 * @ru Переключает состояние паузы воспроизведения
	 * @param interaction Command interaction
	 */
	public async togglePause(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			await this.getPlayer(handles.guildId).togglePause();
		}
	}

	/**
	 * @en Sets the player volume
	 * @ru Устанавливает громкость плеера
	 * @param guildId Discord guild ID
	 * @param volume Volume level (0-100)
	 */
	public async setVolume(guildId: string, volume: number): Promise<void> {
		if (guildId) {
			try {
				// Получаем плеер и ждем завершения установки громкости
				await this.getPlayer(guildId).effects.setVolume(volume);
				this.logger.debug(`Volume for guild ${guildId} set to ${volume}%`);
			} catch (error) {
				this.logger.error(
					`Failed to set volume for guild ${guildId}: ${error}`,
				);
			}
		}
	}

	/**
	 * @en Sets the player loop state
	 * @ru Устанавливает состояние повтора плеера
	 * @param guildId Discord guild ID
	 * @param loop Loop state
	 */
	public async setLoop(guildId: string, loop: boolean): Promise<void> {
		if (guildId) {
			this.getPlayer(guildId).state.loop = loop;
			this.queueService.setLoop(guildId, loop);
		}
	}

	/**
	 * @en Sets the player wave state
	 * @ru Устанавливает состояние волны плеера
	 * @param guildId Discord guild ID
	 * @param wave Wave state
	 */
	public async setWave(guildId: string, wave: boolean): Promise<void> {
		if (guildId) {
			this.getPlayer(guildId).state.wave = wave;
			this.queueService.setWave(guildId, wave);
		}
	}

	/**
	 * @en Sets the player compressor
	 * @ru Устанавливает компрессор на плеер
	 * @param guildId Discord guild ID
	 * @param boolean False || True
	 */
	public async setCompressor(guildId: string, boolean: boolean): Promise<void> {
		if (guildId) {
			try {
				// Получаем плеер и ждем завершения установки громкости
				await this.getPlayer(guildId).effects.setCompressor(boolean);
				this.logger.debug(`Compressor for guild ${guildId} set to ${boolean}`);
			} catch (error) {
				this.logger.error(
					`Failed to set compressor for guild ${guildId}: ${error}`,
				);
			}
		}
	}

	/**
	 * @en Sets the player bass
	 * @ru Устанавливает басс на плеер
	 * @param guildId Discord guild ID
	 * @param number
	 */
	public async setBass(guildId: string, number: number): Promise<void> {
		if (guildId) {
			try {
				// Получаем плеер и ждем завершения установки громкости
				await this.getPlayer(guildId).effects.setBass(number);
				this.logger.debug(`Bass for guild ${guildId} set to ${number}`);
			} catch (error) {
				this.logger.error(`Failed to set bass for guild ${guildId}: ${error}`);
			}
		}
	}

	/**
	 * @en Sets the player treble
	 * @ru Устанавливает высокие частоты на плеер
	 * @param guildId Discord guild ID
	 * @param number
	 */
	public async setTreble(guildId: string, number: number): Promise<void> {
		if (guildId) {
			try {
				// Получаем плеер и ждем завершения установки громкости
				await this.getPlayer(guildId).effects.setTreble(number);
				this.logger.debug(`Treable for guild ${guildId} set to ${number}`);
			} catch (error) {
				this.logger.error(
					`Failed to set treable for guild ${guildId}: ${error}`,
				);
			}
		}
	}

	/**
	 * @en Disconnects from voice channel and removes player instance
	 * @ru Отключается от голосового канала и удаляет экземпляр плеера
	 * @param guildId Discord guild ID
	 */
	public async leaveChannel(guildId: string): Promise<void> {
		const player = this.players.get(guildId);
		if (!player) {
			this.logger.warn(
				bot.locale.t("messages.playerManager.errors.player_not_found", {
					guildId,
				}),
			);
			return;
		}

		await player.destroy();
		player.connectionManager.leaveChannel();
		this.players.delete(guildId);

		// Обновляем кэш, но не удаляем плеер из кэша
		if (this.playerCache.has(guildId)) {
			this.playerCache.get(guildId)!.lastUsed = Date.now();
		}
	}

	/**
	 * @en Destroys all player instances and clears the map
	 * @ru Уничтожает все экземпляры плеера и очищает карту
	 */
	public async destroyAll(): Promise<void> {
		try {
			// Используем Promise.allSettled для обработки ошибок отдельных плееров
			await Promise.allSettled(
				Array.from(this.players.values()).map((player) => player.destroy()),
			);

			// Отключаем все плееры
			for (const player of this.players.values()) {
				player.connectionManager.leaveChannel();
			}

			this.players.clear();

			// Очищаем кэш
			this.playerCache.clear();

			this.logger.info("All players destroyed successfully");
		} catch (error) {
			this.logger.error("Error destroying players:", error);
		}
	}

	/**
	 * @en Graceful shutdown of all players and cleanup
	 * @ru Graceful shutdown всех плееров и очистка
	 */
	public async shutdown(): Promise<void> {
		this.logger.info("Starting PlayerManager shutdown...");

		try {
			// Останавливаем периодическую очистку кэша
			// (в реальности нужно сохранить ссылку на интервал)

			// Уничтожаем все плееры
			await this.destroyAll();

			this.logger.info("PlayerManager shutdown completed successfully");
		} catch (error) {
			this.logger.error("Error during PlayerManager shutdown:", error);
			throw error;
		}
	}
}
