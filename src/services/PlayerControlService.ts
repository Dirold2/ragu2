import type { Track } from "../types/index.js";
import config from "../../config.json" with { type: "json" };
import type PlayerManager from "./player/PlayerManager.js";
import type PlayerService from "./player/PlayerService.js";
import type CacheQueueService from "./player/QueueService.js";

export type PlayerControlErrorCode =
  | "GUILD_ID_REQUIRED"
  | "PLAYER_NOT_FOUND"
  | "QUEUE_EMPTY"
  | "QUEUE_ENTRY_NOT_FOUND"
  | "VOLUME_OUT_OF_RANGE"
  | "WAVE_SEED_REQUIRED";

export type PlayerControlResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: PlayerControlErrorCode };

export type PlayerControlState = {
  queue: {
    entries: Array<{ id: string; track: Track }>;
    loop: boolean;
    volume: number;
    waveEnabled: boolean;
    waveSeed: Track | null;
  };
  player: {
    channelId: string | null;
    currentTrack: Track | null;
    isPaused: boolean;
    isPlaying: boolean;
    loop: boolean;
  } | null;
};

/**
 * Transport-agnostic player operations.
 * Discord and the future HTTP adapter map their requests and responses onto this service.
 */
export default class PlayerControlService {
  constructor(
    private readonly playerManager: PlayerManager,
    private readonly queueService: CacheQueueService,
  ) {}

  async getState(guildId: string): Promise<PlayerControlResult<PlayerControlState>> {
    if (!guildId.trim()) return this.failure("GUILD_ID_REQUIRED");

    const player = this.playerManager.findPlayer(guildId);
    return this.success({
      queue: {
        entries: this.queueService.getQueueEntries(guildId),
        loop: this.queueService.getLoop(guildId),
        volume: this.queueService.getVolume(guildId),
        waveEnabled: this.queueService.getWave(guildId),
        waveSeed: this.queueService.getLastTrack(guildId),
      },
      player: player
        ? {
            channelId: player.state.channelId,
            currentTrack: player.state.currentTrack,
            isPaused: player.state.pause,
            isPlaying: player.state.isPlaying,
            loop: player.state.loop,
          }
        : null,
    });
  }

  async togglePause(guildId: string): Promise<PlayerControlResult<{ paused: boolean }>> {
    const player = this.findPlayer(guildId);
    if (!player.ok) return player;

    await player.data.togglePause();
    return this.success({ paused: player.data.state.pause });
  }

  async skip(
    guildId: string,
    queueEntryId?: string,
  ): Promise<PlayerControlResult<{ target: Track | null }>> {
    const player = this.findPlayer(guildId);
    if (!player.ok) return player;

    let target: Track | null = null;
    if (queueEntryId) {
      target = await this.queueService.skipQueueTo(guildId, queueEntryId);
      if (!target) return this.failure("QUEUE_ENTRY_NOT_FOUND");
    }

    await player.data.skip();
    return this.success({ target });
  }

  async back(guildId: string): Promise<PlayerControlResult<{ track: Track }>> {
    const player = this.findPlayer(guildId);
    if (!player.ok) return player;

    const track = await player.data.back();
    return track ? this.success({ track }) : this.failure("PLAYER_NOT_FOUND");
  }

  async toggleLoop(guildId: string): Promise<PlayerControlResult<{ enabled: boolean }>> {
    const player = this.findPlayer(guildId);
    if (!player.ok) return player;

    const enabled = !player.data.state.loop;
    await this.playerManager.setLoop(guildId, enabled);
    return this.success({ enabled });
  }

  async toggleWave(guildId: string): Promise<PlayerControlResult<{ enabled: boolean }>> {
    if (!guildId.trim()) return this.failure("GUILD_ID_REQUIRED");

    const enabled = this.queueService.getWave(guildId);
    if (!enabled && this.queueService.getLastTrack(guildId)?.source !== "yandex") {
      return this.failure("WAVE_SEED_REQUIRED");
    }

    await this.playerManager.setWave(guildId, !enabled);
    return this.success({ enabled: !enabled });
  }

  async setVolume(
    guildId: string,
    volume: number,
  ): Promise<PlayerControlResult<{ volume: number }>> {
    if (!guildId.trim()) return this.failure("GUILD_ID_REQUIRED");

    const maximum = config.audio.volume.range.max * 100;
    if (!Number.isFinite(volume) || volume < 0 || volume > maximum) {
      return this.failure("VOLUME_OUT_OF_RANGE");
    }

    await this.playerManager.setVolume(guildId, volume);
    return this.success({ volume });
  }

  async deleteFromQueue(
    guildId: string,
    queueEntryId?: string,
  ): Promise<PlayerControlResult<{ track: Track }>> {
    if (!guildId.trim()) return this.failure("GUILD_ID_REQUIRED");

    const entryId = queueEntryId ?? this.queueService.getQueueEntries(guildId).at(-1)?.id;
    if (!entryId) return this.failure("QUEUE_EMPTY");

    const track = await this.queueService.removeQueueEntry(guildId, entryId);
    return track ? this.success({ track }) : this.failure("QUEUE_ENTRY_NOT_FOUND");
  }

  async shuffle(guildId: string): Promise<PlayerControlResult<{ count: number }>> {
    if (!guildId.trim()) return this.failure("GUILD_ID_REQUIRED");
    if (!this.playerManager.findPlayer(guildId)) return this.failure("PLAYER_NOT_FOUND");

    const count = await this.queueService.shuffleTracks(guildId);
    return count > 1 ? this.success({ count }) : this.failure("QUEUE_EMPTY");
  }

  private findPlayer(guildId: string): PlayerControlResult<PlayerService> {
    if (!guildId.trim()) return this.failure("GUILD_ID_REQUIRED");

    const player = this.playerManager.findPlayer(guildId);
    return player ? this.success(player) : this.failure("PLAYER_NOT_FOUND");
  }

  private success<T>(data: T): PlayerControlResult<T> {
    return { ok: true, data };
  }

  private failure(code: PlayerControlErrorCode): PlayerControlResult<never> {
    return { ok: false, code };
  }
}
