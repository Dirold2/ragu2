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
	private readonly INACTIVE_TIMEOUT = 3600_000;
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

	public getPlayer(guildId: string): PlayerService {
		if (!guildId?.trim()) {
			throw new Error("guildId is required");
		}

		if (this.players.has(guildId)) {
			const player = this.players.get(guildId)!;
			this.updateCache(guildId, player);
			return player;
		}

		if (this.playerCache.has(guildId)) {
			const cacheEntry = this.playerCache.get(guildId)!;
			cacheEntry.lastUsed = Date.now();
			this.players.set(guildId, cacheEntry.player);
			this.logger?.debug?.(
				`[PlayerManager] Restored player from cache: ${guildId}`,
			);
			this.emit("playerRestored", guildId);
			return cacheEntry.player;
		}

		const newPlayer = new PlayerService(guildId, this.bot);
		this.players.set(guildId, newPlayer);
		this.playerCache.set(guildId, { lastUsed: Date.now(), player: newPlayer });
		this.logger?.debug?.(`[PlayerManager] Created new player: ${guildId}`);
		this.emit("playerCreated", guildId);
		return newPlayer;
	}

	private updateCache(guildId: string, player: PlayerService): void {
		if (this.playerCache.has(guildId)) {
			this.playerCache.get(guildId)!.lastUsed = Date.now();
		} else {
			this.playerCache.set(guildId, { player, lastUsed: Date.now() });
		}
	}

	public async joinChannel(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (!handles?.guildId) return;

		try {
			const player = this.getPlayer(handles.guildId);
			await player.joinChannel(interaction);
		} catch (err) {
			this.logger?.error?.(
				`[PlayerManager] Failed to join channel: ${(err as Error).message}`,
			);
		}
	}

	public async playOrQueueTrack(
		guildId: string,
		track: Track | null,
	): Promise<void> {
		if (!track) return;

		try {
			const player = this.getPlayer(guildId);
			await player.playOrQueueTrack(track);
		} catch (err) {
			this.logger?.error?.(
				`[PlayerManager] Failed to play or queue track: ${(err as Error).message}`,
			);
		}
	}

	public async skip(guildId: string): Promise<void> {
		try {
			const player = this.getPlayer(guildId);
			await player.skip();
		} catch (err) {
			this.logger?.error?.(
				`[PlayerManager] Failed to skip: ${(err as Error).message}`,
			);
		}
	}

	public async togglePause(interaction: CommandInteraction): Promise<void> {
		const handles = await this.handleServerOnlyCommand(interaction);
		if (!handles?.guildId) return;

		try {
			const player = this.getPlayer(handles.guildId);
			await player.togglePause();
		} catch (err) {
			this.logger?.error?.(
				`[PlayerManager] Failed to toggle pause: ${(err as Error).message}`,
			);
		}
	}

	public async setVolume(guildId: string, volume: number): Promise<void> {
		const player = this.getPlayer(guildId);
		if (!player) return;

		try {
			const normalizedVolume = Math.max(0, Math.min(200, volume));
			await player.effects.setVolume(normalizedVolume);
			player.state.volume = normalizedVolume;
			this.queueService?.setVolume?.(guildId, normalizedVolume);
			this.logger?.debug?.(
				`[PlayerManager] Volume set to ${normalizedVolume}% for ${guildId}`,
			);
		} catch (err) {
			this.logger?.error?.(
				`[PlayerManager] Failed to set volume: ${(err as Error).message}`,
			);
		}
	}

	public async setLoop(guildId: string, loop: boolean): Promise<void> {
		const player = this.getPlayer(guildId);
		if (!player) return;
		player.state.loop = loop;
		this.queueService?.setLoop?.(guildId, loop);
	}

	public async setWave(guildId: string, wave: boolean): Promise<void> {
		const player = this.getPlayer(guildId);
		if (!player) return;
		player.state.wave = wave;
		this.queueService?.setWave?.(guildId, wave);
	}

	public async setCompressor(guildId: string, value: boolean): Promise<void> {
		const player = this.getPlayer(guildId);
		if (!player) return;
		try {
			await player.effects.setCompressor(value);
		} catch (err) {
			this.logger?.error?.(
				`[PlayerManager] Failed to set compressor: ${(err as Error).message}`,
			);
		}
	}

	public async setBass(guildId: string, value: number): Promise<void> {
		const player = this.getPlayer(guildId);
		if (!player) return;
		try {
			player.effects.setBass(value);
		} catch (err) {
			this.logger?.error?.(
				`[PlayerManager] Failed to set bass: ${(err as Error).message}`,
			);
		}
	}

	public async setTreble(guildId: string, value: number): Promise<void> {
		const player = this.getPlayer(guildId);
		if (!player) return;
		try {
			player.effects.setTreble(value);
		} catch (err) {
			this.logger?.error?.(
				`[PlayerManager] Failed to set treble: ${(err as Error).message}`,
			);
		}
	}

	public async leaveChannel(guildId: string): Promise<void> {
		const player = this.safeGetPlayer(guildId);
		if (!player) return;

		try {
			await player.destroy();
			player.connectionManager.leaveChannel();
			this.players.delete(guildId);
			this.updateCache(guildId, player);
			this.logger?.debug?.(
				`[PlayerManager] Left channel and destroyed player: ${guildId}`,
			);
			this.emit("playerDestroyed", guildId);
		} catch (err) {
			this.logger?.error?.(
				`[PlayerManager] Failed to leave channel: ${(err as Error).message}`,
			);
		}
	}

	public async destroyAll(): Promise<void> {
		for (const [_guildId, player] of this.players.entries()) {
			try {
				await player.destroy();
				player.connectionManager.leaveChannel();
			} catch {
				// Ignore errors during cleanup
			}
		}

		this.players.clear();
		this.playerCache.clear();
		this.stopCacheCleanup();
		this.logger?.info?.("[PlayerManager] All players destroyed");
	}

	private startCacheCleanup(): void {
		this.cacheCleanupInterval = setInterval(() => {
			const now = Date.now();

			for (const [guildId, entry] of this.playerCache.entries()) {
				if (now - entry.lastUsed > this.INACTIVE_TIMEOUT) {
					this.logger?.debug?.(
						`[PlayerManager] Removing inactive player from cache: ${guildId}`,
					);
					try {
						entry.player.destroy();
						this.players.delete(guildId);
						this.playerCache.delete(guildId);
						this.emit("playerDestroyed", guildId);
					} catch {
						// Ignore errors
					}
				}
			}
		}, this.CACHE_CLEANUP_INTERVAL);
	}

	private stopCacheCleanup(): void {
		if (this.cacheCleanupInterval) {
			clearInterval(this.cacheCleanupInterval);
			this.cacheCleanupInterval = null;
		}
	}

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
			await this.commandService?.reply?.(
				interaction,
				"messages.playerManager.errors.server_error",
			);
			return null;
		}

		return { guildId, channelId };
	}

	public async shutdown(): Promise<void> {
		this.logger?.info?.("[PlayerManager] Shutdown started");
		await this.destroyAll();
		this.logger?.info?.("[PlayerManager] Shutdown completed");
	}
}
