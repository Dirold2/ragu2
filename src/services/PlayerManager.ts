import type { CommandInteraction } from "discord.js";

import type { Track } from "../interfaces/index.js";
import { type CommandService, PlayerService } from "./index.js";
import { bot } from "../bot.js";

/**
 * Управляет экземплярами плеера для разных Discord-серверов
 */
export default class PlayerManager {
	private readonly players: Map<string, PlayerService> = new Map();
	private readonly queueService = bot.queueService;
	private readonly commandService: CommandService;
	private readonly logger = bot.logger;

	// Добавляем кэш для оптимизации
	private readonly playerCache = new Map<
		string,
		{ lastUsed: number; player: PlayerService }
	>();
	private readonly CACHE_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 минут

	/**
	 * Создает новый экземпляр PlayerManager
	 */
	constructor(queueService = bot.queueService, commandService: CommandService) {
		this.queueService = queueService;
		this.commandService = commandService;

		// Запускаем периодическую очистку кэша
		this.startCacheCleanup();
	}

	/**
	 * Запускает периодическую очистку кэша неиспользуемых плееров
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
	 * Проверяет, что команда выполняется в контексте сервера
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
	 * Получает или создает экземпляр плеера для сервера
	 * Оптимизировано с использованием кэша
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
		const newPlayer = new PlayerService(this.commandService, guildId);

		// Сохраняем в активные плееры и кэш
		this.players.set(guildId, newPlayer);
		this.playerCache.set(guildId, {
			player: newPlayer,
			lastUsed: Date.now(),
		});

		return newPlayer;
	}

	/**
	 * Присоединяется к голосовому каналу
	 */
	public async joinChannel(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			const player = this.getPlayer(handles.guildId);
			await player.joinChannel(interaction);
		}
	}

	/**
	 * Воспроизводит или добавляет трек в очередь на сервере
	 */
	public async playOrQueueTrack(guildId: string, track: Track): Promise<void> {
		await this.getPlayer(guildId).playOrQueueTrack(track);
	}

	/**
	 * Пропускает текущий трек
	 */
	public async skip(guildId: string): Promise<void> {
		if (guildId) {
			await this.getPlayer(guildId).skip();
		}
	}

	/**
	 * Переключает состояние паузы воспроизведения
	 */
	public async togglePause(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (handles?.guildId) {
			await this.getPlayer(handles.guildId).togglePause();
		}
	}

	/**
	 * Устанавливает громкость плеера
	 */
	public async setVolume(guildId: string, volume: number): Promise<void> {
		if (guildId) {
			try {
				// Получаем плеер и ждем завершения установки громкости
				await this.getPlayer(guildId).setVolume(volume);
				this.logger.debug(`Volume for guild ${guildId} set to ${volume}%`);
			} catch (error) {
				this.logger.error(
					`Failed to set volume for guild ${guildId}: ${error}`,
				);
			}
		}
	}

	/**
	 * Устанавливает состояние повтора плеера
	 */
	public async setLoop(guildId: string, loop: boolean): Promise<void> {
		if (guildId) {
			this.getPlayer(guildId).state.loop = loop;
			this.queueService.setLoop(guildId, loop);
		}
	}

	/**
	 * Устанавливает состояние волны плеера
	 */
	public async setWave(guildId: string, wave: boolean): Promise<void> {
		if (guildId) {
			this.getPlayer(guildId).state.wave = wave;
			this.queueService.setWave(guildId, wave);
		}
	}

	/**
	 * Отключается от голосового канала и удаляет экземпляр плеера
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
		player.leaveChannel();
		this.players.delete(guildId);

		// Обновляем кэш, но не удаляем плеер из кэша
		if (this.playerCache.has(guildId)) {
			this.playerCache.get(guildId)!.lastUsed = Date.now();
		}
	}

	/**
	 * Уничтожает все экземпляры плеера и очищает карту
	 */
	public async destroyAll(): Promise<void> {
		try {
			// Используем Promise.allSettled для обработки ошибок отдельных плееров
			await Promise.allSettled(
				Array.from(this.players.values()).map((player) => player.destroy()),
			);

			// Отключаем все плееры
			for (const player of this.players.values()) {
				player.leaveChannel();
			}

			this.players.clear();

			// Очищаем кэш
			this.playerCache.clear();

			this.logger.info("All players destroyed successfully");
		} catch (error) {
			this.logger.error("Error destroying players:", error);
		}
	}
}
