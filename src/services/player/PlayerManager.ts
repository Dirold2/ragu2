import type { CommandInteraction } from "discord.js";
import type { Track } from "../../interfaces/index.js";
import { type CommandService, PlayerService } from "../index.js";
import { bot } from "../../bot.js";
import { EventEmitter } from "eventemitter3";

interface PlayerCacheEntry {
	lastUsed: number;
	player: PlayerService;
}

export default class PlayerManager extends EventEmitter {
	private readonly players: Map<string, PlayerService> = new Map();
	private readonly playerCache: Map<string, PlayerCacheEntry> = new Map();
	private readonly CACHE_CLEANUP_INTERVAL = 30 * 60 * 1000;
	private cacheCleanupInterval: NodeJS.Timeout | null = null;

	private readonly queueService = bot.queueService;
	private readonly commandService: CommandService;
	private readonly logger = bot.logger;
	private readonly bot = bot;

	constructor(queueService = bot.queueService, commandService: CommandService) {
		super();
		this.queueService = queueService;
		this.commandService = commandService;
		this.startCacheCleanup();
	}

	/** ----------------------------- */
	/** Player lifecycle management  */
	/** ----------------------------- */

	public getPlayer(guildId: string): PlayerService {
		if (!guildId) throw new Error("guildId is required");

		// Активный плеер
		if (this.players.has(guildId)) {
			const player = this.players.get(guildId)!;
			this.updateCache(guildId, player);
			return player;
		}

		// Восстановление из кэша
		if (this.playerCache.has(guildId)) {
			const cacheEntry = this.playerCache.get(guildId)!;
			cacheEntry.lastUsed = Date.now();
			this.players.set(guildId, cacheEntry.player);
			this.logger.debug(`Restored player for guild ${guildId} from cache`);
			this.emit("playerRestored", guildId);
			return cacheEntry.player;
		}

		// Создание нового плеера
		const newPlayer = new PlayerService(guildId, this.bot);
		this.players.set(guildId, newPlayer);
		this.playerCache.set(guildId, { lastUsed: Date.now(), player: newPlayer });
		this.logger.debug(`Created new player for guild ${guildId}`);
		this.emit("playerCreated", guildId);
		return newPlayer;
	}

	private updateCache(guildId: string, player: PlayerService) {
		if (this.playerCache.has(guildId)) {
			this.playerCache.get(guildId)!.lastUsed = Date.now();
		} else {
			this.playerCache.set(guildId, { player, lastUsed: Date.now() });
		}
	}

	/** ----------------------------- */
	/** Channel & Playback actions   */
	/** ----------------------------- */

	public async joinChannel(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (!handles?.guildId) return;

		try {
			const player = this.getPlayer(handles.guildId);
			await player.joinChannel(interaction);
		} catch (err) {
			this.logger.error(`[PlayerManager] Failed to join channel: ${err}`);
		}
	}

	public async playOrQueueTrack(guildId: string, track: Track): Promise<void> {
		try {
			const player = this.getPlayer(guildId);
			await player.playOrQueueTrack(track);
		} catch (err: any) {
			this.logger.error(
				`[PlayerManager] Failed to play or queue track: ${err.name}: ${err.message}`,
			);
			if (err.stack) this.logger.error(err.stack);
		}
	}

	public async skip(guildId: string): Promise<void> {
		try {
			const player = this.getPlayer(guildId);
			await player.skip();
		} catch (err) {
			this.logger.error(`[PlayerManager] Failed to skip track: ${err}`);
		}
	}

	public async togglePause(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (!handles?.guildId) return;

		try {
			const player = this.getPlayer(handles.guildId);
			await player.togglePause();
		} catch (err) {
			this.logger.error(`[PlayerManager] Failed to toggle pause: ${err}`);
		}
	}

	/** ----------------------------- */
	/** Player settings              */
	/** ----------------------------- */

	public async setVolume(guildId: string, volume: number): Promise<void> {
		const player = this.getPlayer(guildId);
		if (!player) return;
		try {
			await player.effects.setVolume(volume);
			player.state.volume = volume;
			this.queueService.setVolume(guildId, volume);
			this.logger.debug(`Volume for guild ${guildId} set to ${volume}%`);
		} catch (err) {
			this.logger.error(`[PlayerManager] Failed to set volume: ${err}`);
		}
	}

	public async setLoop(guildId: string, loop: boolean) {
		const player = this.getPlayer(guildId);
		if (!player) return;
		player.state.loop = loop;
		this.queueService.setLoop(guildId, loop);
	}

	public async setWave(guildId: string, wave: boolean) {
		const player = this.getPlayer(guildId);
		if (!player) return;
		player.state.wave = wave;
		this.queueService.setWave(guildId, wave);
	}

	public async setCompressor(guildId: string, value: boolean) {
		const player = this.getPlayer(guildId);
		if (!player) return;
		try {
			await player.effects.setCompressor(value);
		} catch (err) {
			this.logger.error(`[PlayerManager] Failed to set compressor: ${err}`);
		}
	}

	public async setBass(guildId: string, value: number) {
		const player = this.getPlayer(guildId);
		if (!player) return;
		try {
			await player.effects.setBass(value);
		} catch (err) {
			this.logger.error(`[PlayerManager] Failed to set bass: ${err}`);
		}
	}

	public async setTreble(guildId: string, value: number) {
		const player = this.getPlayer(guildId);
		if (!player) return;
		try {
			await player.effects.setTreble(value);
		} catch (err) {
			this.logger.error(`[PlayerManager] Failed to set treble: ${err}`);
		}
	}

	/** ----------------------------- */
	/** Leave & destroy              */
	/** ----------------------------- */

	public async leaveChannel(guildId: string) {
		const player = this.safeGetPlayer(guildId);
		if (!player) return;
		try {
			await player.destroy();
			player.connectionManager.leaveChannel();
			this.players.delete(guildId);
			this.updateCache(guildId, player);
			this.logger.debug(
				`Left channel and destroyed player for guild ${guildId}`,
			);
			this.emit("playerDestroyed", guildId);
		} catch (err) {
			this.logger.error(`[PlayerManager] Failed to leave channel: ${err}`);
		}
	}

	public async destroyAll() {
		for (const [, player] of this.players.entries()) {
			try {
				await player.destroy();
				player.connectionManager.leaveChannel();
			} catch {}
		}
		this.players.clear();
		this.playerCache.clear();
		this.stopCacheCleanup();
		this.logger.info("All players destroyed");
	}

	/** ----------------------------- */
	/** Cache cleanup               */
	/** ----------------------------- */

	private startCacheCleanup() {
		this.cacheCleanupInterval = setInterval(() => {
			const now = Date.now();
			const expiration = now - 3600_000; // 1 час неактивности

			for (const [guildId, entry] of this.playerCache.entries()) {
				if (entry.lastUsed < expiration) {
					this.logger.debug(`Removing inactive player from cache: ${guildId}`);
					try {
						entry.player.destroy();
						this.players.delete(guildId);
						this.playerCache.delete(guildId);
						this.emit("playerDestroyed", guildId);
					} catch {}
				}
			}
		}, this.CACHE_CLEANUP_INTERVAL);
	}

	private stopCacheCleanup() {
		if (this.cacheCleanupInterval) {
			clearInterval(this.cacheCleanupInterval);
			this.cacheCleanupInterval = null;
		}
	}

	/** ----------------------------- */
	/** Helpers                     */
	/** ----------------------------- */

	private safeGetPlayer(guildId?: string): PlayerService | null {
		if (!guildId) return null;
		return (
			this.players.get(guildId) ?? this.playerCache.get(guildId)?.player ?? null
		);
	}

	private async handleServerOnlyCommand(
		interaction: CommandInteraction,
	): Promise<{ guildId: string; channelId: string } | null> {
		const { guildId, channelId } = interaction;
		if (!guildId || !channelId) {
			await this.commandService.reply(
				interaction,
				"messages.playerManager.errors.server_error",
			);
			return null;
		}
		return { guildId, channelId };
	}

	/** Graceful shutdown */
	public async shutdown() {
		this.logger.info("PlayerManager shutdown started...");
		await this.destroyAll();
		this.logger.info("PlayerManager shutdown completed");
	}
}
