import type { CommandInteraction } from "discord.js";
import type { Track } from "../../types/index.js";
import { type CacheQueueService, type CommandService, PlayerService } from "../index.js";
import { createLogger, type Logger } from "dlog2";
import { MiniEmitter } from "hemmiter";
import type { MusicServicePlugin } from "../../interfaces/index.js";

interface PlayerServiceDeps {
  logger: Logger;
  client: {
    user?: { id: string } | null;
    rest: {
      put(route: string, options: { body: { status: string | null } }): Promise<unknown>;
    };
    guilds: {
      fetch(id: string): Promise<{ channels: { fetch(): Promise<Map<string, any>> } }>;
    };
  };
  pluginManager: { getPlugin(name: string): MusicServicePlugin | undefined };
  t: (key: string, params?: Record<string, unknown>, lang?: string | boolean) => string;
}

type PlayerManagerEvents = {
  playerCreated: [guildId: string];
  playerDestroyed: [guildId: string];
};

export default class PlayerManager extends MiniEmitter<PlayerManagerEvents> {
  private readonly players = new Map<string, PlayerService>();
  private readonly logger: Logger;
  private readonly playerDeps: PlayerServiceDeps;

  constructor(
    private readonly queueService: CacheQueueService,
    private readonly commandService: CommandService,
    client: PlayerServiceDeps["client"],
    pluginManager: PlayerServiceDeps["pluginManager"],
    t: PlayerServiceDeps["t"],
    logger?: Logger,
  ) {
    super();
    this.logger = logger ?? createLogger("PlayerManager");
    this.playerDeps = { logger: this.logger, client, pluginManager, t };
  }

  public getPlayer(guildId: string): PlayerService {
    if (!guildId?.trim()) {
      throw new Error("guildId is required");
    }

    const player = this.players.get(guildId);
    if (player) return player;

    const newPlayer = new PlayerService(guildId, {
      ...this.playerDeps,
      queueService: this.queueService,
    });
    this.players.set(guildId, newPlayer);
    this.logger?.debug?.(`[PlayerManager] Created new player: ${guildId}`);
    this.emit("playerCreated", guildId);
    return newPlayer;
  }

  public async joinChannel(interaction: CommandInteraction): Promise<void> {
    const handles = await this.handleServerOnlyCommand(interaction);
    if (!handles?.guildId) return;

    try {
      const player = this.getPlayer(handles.guildId);
      await player.joinChannel(interaction);
    } catch (err) {
      this.logger?.error?.(`[PlayerManager] Failed to join channel: ${(err as Error).message}`);
    }
  }

  public async playOrQueueTrack(guildId: string, track: Track | null): Promise<void> {
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
      this.logger?.error?.(`[PlayerManager] Failed to skip: ${(err as Error).message}`);
    }
  }

  public async togglePause(interaction: CommandInteraction): Promise<void> {
    const handles = await this.handleServerOnlyCommand(interaction);
    if (!handles?.guildId) return;

    try {
      const player = this.getPlayer(handles.guildId);
      await player.togglePause();
    } catch (err) {
      this.logger?.error?.(`[PlayerManager] Failed to toggle pause: ${(err as Error).message}`);
    }
  }

  public async setVolume(guildId: string, volume: number): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) return;

    try {
      const normalizedVolume = Math.max(0, Math.min(100, volume));
      await player.setVolume(normalizedVolume);
      player.setStateVolume(normalizedVolume);
      this.queueService?.setVolume?.(guildId, normalizedVolume);
      this.logger?.debug?.(`[PlayerManager] Volume set to ${normalizedVolume}% for ${guildId}`);
    } catch (err) {
      this.logger?.error?.(`[PlayerManager] Failed to set volume: ${(err as Error).message}`);
    }
  }

  public async setLoop(guildId: string, loop: boolean): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) return;
    player.setLoop(loop);
    this.queueService?.setLoop?.(guildId, loop);
  }

  public async setWave(guildId: string, wave: boolean): Promise<void> {
    if (!wave) {
      this.playerDeps.pluginManager.getPlugin("yandex")?.resetRadioSession?.(guildId);
      this.logger.debug(`[Wave] Disabled for guild: ${guildId}`);
    } else {
      this.logger.debug(`[Wave] Enabled for guild: ${guildId}`);
    }

    this.queueService.setWave(guildId, wave);
  }

  public async setCompressor(guildId: string, value: boolean): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) return;
    try {
      player.audioService.setCompressor(value);
    } catch (err) {
      this.logger?.error?.(`[PlayerManager] Failed to set compressor: ${(err as Error).message}`);
    }
  }

  public async setNormalize(guildId: string, value: boolean): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) return;
    try {
      player.audioService.setNormalize(value);
    } catch (err) {
      this.logger?.error?.(`[PlayerManager] Failed to set normalize: ${(err as Error).message}`);
    }
  }

  public async setBass(guildId: string, value: number): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) return;
    try {
      player.audioService.setBass(value);
    } catch (err) {
      this.logger?.error?.(`[PlayerManager] Failed to set bass: ${(err as Error).message}`);
    }
  }

  public async setTreble(guildId: string, value: number): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) return;
    try {
      player.audioService.setTreble(value);
    } catch (err) {
      this.logger?.error?.(`[PlayerManager] Failed to set treble: ${(err as Error).message}`);
    }
  }

  public async leaveChannel(guildId: string): Promise<void> {
    const player = this.safeGetPlayer(guildId);
    if (!player) return;

    try {
      await player.destroy();
      this.players.delete(guildId);
      this.logger?.debug?.(`[PlayerManager] Left channel and destroyed player: ${guildId}`);
      this.emit("playerDestroyed", guildId);
    } catch (err) {
      this.logger?.error?.(`[PlayerManager] Failed to leave channel: ${(err as Error).message}`);
    }
  }

  public async destroyAll(): Promise<void> {
    for (const [_guildId, player] of this.players.entries()) {
      try {
        await player.destroy();
      } catch {
        // Ignore errors during cleanup
      }
    }

    this.players.clear();
    this.logger?.info?.("[PlayerManager] All players destroyed");
  }

  private safeGetPlayer(guildId?: string): PlayerService | null {
    return guildId ? (this.players.get(guildId) ?? null) : null;
  }

  private async handleServerOnlyCommand(
    interaction: CommandInteraction,
  ): Promise<{ guildId: string; channelId: string } | null> {
    const { guildId, channelId } = interaction;
    if (!guildId || !channelId) {
      await this.commandService?.reply?.(interaction, "messages.playerManager.errors.server_error");
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
