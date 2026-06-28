import type { Logger } from "dlog2";
import type { CommandInteraction } from "discord.js";
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import EventEmitter from "events";
import { Readable } from "node:stream";
import { AudioService } from "../audio/AudioService.js";
import { TrackManager } from "./TrackManager.js";
import { ConnectionManager } from "./ConnectionManager.js";
import type { PlayerState } from "../../types/audio.js";
import { PlayerServiceEvents } from "../../types/audio.js";
import config from "../../../config.json" with { type: "json" };
import { PlayerQueue, type QueueServiceSubset } from "./PlayerQueue.js";
import { PlayerEffects } from "./PlayerEffects.js";
import type { Track } from "../../types/index.js";
import type { MusicServicePlugin } from "../../interfaces/index.js";

interface PluginManagerSubset {
  getPlugin(name: string): MusicServicePlugin | undefined;
}

interface PlayerServiceDeps {
  logger: Logger;
  queueService: QueueServiceSubset;
  client: { user?: { id: string } | null; guilds: { fetch(id: string): Promise<{ channels: { fetch(): Promise<Map<string, any>> } }> } };
  pluginManager: PluginManagerSubset;
  t: (key: string, params?: Record<string, unknown>, lang?: string | boolean) => string;
}

export default class PlayerService extends EventEmitter {
  private readonly player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  private audioService: AudioService;
  private trackManager: TrackManager;
  public connectionManager: ConnectionManager;
  private queue: PlayerQueue;
  public effects: PlayerEffects;
  private fadeOutTimer: NodeJS.Timeout | null = null;
  public state: PlayerState;
  private isDestroyed = false;

  private isHandlingError = false;
  private skipInProgress = false;

  private logDebug(msg: string): void {
    this.deps.logger.debug?.(`[PlayerService] ${msg}`);
  }

  private logError(msg: string): void {
    this.deps.logger.error?.(`[PlayerService] ${msg}`);
  }

  private clearFadeTimer(): void {
    if (this.fadeOutTimer) {
      clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async recoverFromAudioError(): Promise<void> {
    this.player.stop();
    await this.sleep(500);
    await this.playNextOrRecommendations();
  }

  private async performFadeOutAndStop(): Promise<void> {
    this.clearFadeTimer();
    await this.effects.setVolume(0, 1000, false);
    await this.sleep(1300);
    await this.audioService.stop();
    await this.sleep(200);
    this.player.stop();
    await this.sleep(200);
  }

  constructor(
    public readonly guildId: string,
    private readonly deps: PlayerServiceDeps,
  ) {
    super();
    this.audioService = new AudioService();
    this.trackManager = new TrackManager(deps.logger, deps.pluginManager, deps.t);
    this.connectionManager = new ConnectionManager(guildId, deps.logger, deps.client);
    this.state = this.getInitialState();

    const savedVolume = deps.queueService?.getVolume?.(guildId);
    if (typeof savedVolume === "number") {
      this.state.volume = Math.max(0, Math.min(200, savedVolume));
    }

    this.queue = new PlayerQueue(guildId, deps.logger, deps.queueService, this.emit.bind(this), this.trackManager);

    this.effects = new PlayerEffects(this.audioService);
    this.state.lastUserTrack = deps.queueService?.getLastTrack?.(guildId) ?? null;

    this.setupEvents();
  }

  private setupEvents(): void {
    this.setupPlayerEvents();
    this.setupAudioServiceEvents();
    this.setupConnectionEvents();
  }

  private setupPlayerEvents(): void {
    this.player.on(AudioPlayerStatus.Playing, () => {
      if (this.isDestroyed) return;
      this.logDebug("Playing");
      this.state.isPlaying = true;
      this.state.pause = false;
      this.emit(PlayerServiceEvents.PLAYING);
    });

    this.player.on(AudioPlayerStatus.Paused, () => {
      if (this.isDestroyed) return;
      this.logDebug("Paused");
      this.state.isPlaying = false;
      this.state.pause = true;
      this.emit(PlayerServiceEvents.PAUSED);
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.isDestroyed) return;
      this.handleTrackEnd();
    });

    this.player.on("error", (error) => {
      if (this.isDestroyed) return;

      if (error.message.includes("Premature close")) {
        this.logDebug("Ignoring premature close in player");
        return;
      }

      this.logError("Player error:");
      this.handleTrackEnd();
    });
  }

  private setupAudioServiceEvents(): void {
    this.audioService.on("volumeChanged", (volume: number) => {
      if (!this.isDestroyed) {
        this.emit(PlayerServiceEvents.VOLUME_CHANGED, volume);
      }
    });

    this.audioService.on("error", async (error: Error) => {
      if (this.isDestroyed || this.isHandlingError) return;

      if (error.message.includes("Premature close")) {
        this.logDebug("Ignoring premature close in AudioService");
        return;
      }

      this.logError("AudioService error:");

      this.isHandlingError = true;
      try {
        await this.recoverFromAudioError();
      } catch (e) {
        this.logError(
          `Failed to recover from error: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        this.isHandlingError = false;
      }
    });

    this.audioService.on("debug", (message: string) => {
      this.deps.logger?.debug?.(message);
    });
  }

  private setupConnectionEvents(): void {
    this.connectionManager.on("connected", (channelId: string) => {
      if (this.isDestroyed) return;
      this.logDebug(`Connected to ${channelId}`);
      this.state.channelId = channelId;
      this.state.connection = this.connectionManager.getConnection();
      this.emit(PlayerServiceEvents.CONNECTED, channelId);
    });

    this.connectionManager.on("disconnected", () => {
      if (this.isDestroyed) return;
      this.handleDisconnection();
    });
  }

  private handleDisconnection(): void {
    if (this.isDestroyed) return;
    this.logDebug("Disconnected");
    this.player.stop();
    this.resetState();
    this.emit(PlayerServiceEvents.DISCONNECTED);
  }

  async playOrQueueTrack(track: Track | null, interaction?: CommandInteraction): Promise<void> {
    if (!track || this.isDestroyed) return;
    this.logDebug(`playOrQueueTrack: ${track.info}`);

    try {
      const isConnected = !!this.connectionManager.getConnection();
      if (!isConnected && interaction) {
        await this.joinChannel(interaction);
      }

      if (this.state.isPlaying) {
        await this.queue.queueTrack(track);
      } else {
        await this.playTrack(track);
      }

      if (!this.state.nextTrack) {
        this.state.nextTrack = await this.queue.peekNextTrack();
      }
    } catch (error) {
      this.logError(`Error in playOrQueueTrack: ${(error as Error).message}`);
    }
  }

  async skip(): Promise<void> {
    if (this.isDestroyed || this.skipInProgress) return;

    this.skipInProgress = true;
    try {
      this.logDebug("Skipping track");
      await this.performFadeOutAndStop();
    } catch (error) {
      this.logError(`Error in skip: ${(error as Error).message}`);
    } finally {
      this.skipInProgress = false;
    }
  }

  async playTrack(track: Track | null): Promise<boolean> {
    if (!track || this.isDestroyed) return false;

    try {
      this.logDebug(`Playing: ${track.info}`);
      this.connectionManager.resetIdleTimeout();

      const trackUrl = await this.trackManager.getTrackUrl(track.trackId, track.source);

      if (!trackUrl) {
        this.deps.logger?.warn?.("[PlayerService] No track URL found");
        return await this.playNextOrRecommendations();
      }

      const streamResult = await this.audioService.createAudioStreamForDiscord(trackUrl);
      const { stream, type } = streamResult;
      const nodeStream = Readable.fromWeb(stream as any);
      const resource = createAudioResource(nodeStream, { inputType: type });

      this.state.currentTrack = track;
      if (!track.generation) {
        this.deps.queueService?.setLastTrack?.(this.guildId, track);
      }

      this.player.play(resource);
      await this.effects.fadeIn(this.state.volume);

      const durationMs = track.durationMs ?? (await this.trackManager.getDuration(trackUrl));
      const scheduledForTrackId = track.trackId;

      this.fadeOutTimer = await this.effects.scheduleFadeOut(durationMs, async () => {
        if (this.state.currentTrack?.trackId === scheduledForTrackId) {
          await this.effects.setVolume(0, 2000, false);
        }
      });

      this.emit(PlayerServiceEvents.TRACK_STARTED, track);
      return true;
    } catch (error) {
      this.logError(`Error playing track: ${(error as Error).message}`);
      return await this.playNextOrRecommendations();
    }
  }

  async togglePause(): Promise<void> {
    if (!this.state.connection || this.isDestroyed) return;

    try {
      const status = this.player.state.status;
      switch (status) {
        case AudioPlayerStatus.Playing:
          this.player.pause();
          break;
        case AudioPlayerStatus.Paused:
          this.player.unpause();
          break;
      }
    } catch (error) {
      this.logError(`Error toggling pause: ${(error as Error).message}`);
    }
  }

  private async handleTrackEnd(): Promise<void> {
    if (this.isDestroyed) return;

    this.clearFadeTimer();

    const prevTrack = this.state.currentTrack;
    this.state.currentTrack = null;
    this.state.isPlaying = false;
    this.state.pause = false;

    this.emit(PlayerServiceEvents.TRACK_ENDED, prevTrack);
    await this.playNextOrRecommendations();
  }

  async joinChannel(interaction: CommandInteraction): Promise<void> {
    if (this.isDestroyed) return;

    try {
      const connection = await this.connectionManager.joinChannel(interaction);
      connection.subscribe(this.player);
      this.logDebug("Joined channel");
    } catch (error) {
      this.logError(`Error joining channel: ${(error as Error).message}`);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    if (this.isDestroyed) return;

    try {
      this.logDebug("Destroying");
      this.isDestroyed = true;

      this.clearFadeTimer();

      this.player.stop();
      await this.audioService.destroy();
      this.effects.destroy();
      this.connectionManager.destroy();
      this.trackManager.clearCache();
      this.removeAllListeners();
      this.resetState();
    } catch (error) {
      this.logError(`Error destroying: ${(error as Error).message}`);
    }
  }

  private async playNextOrRecommendations(): Promise<boolean> {
    try {
      const lastTrack = this.state.currentTrack;
      await this.queue.playNextTrack(lastTrack, this.state.loop, this.playTrack.bind(this), () =>
        this.queue.tryPlayRecommendations(
          this.deps.queueService?.getLastTrack?.(this.guildId) ?? null,
          this.playTrack.bind(this),
        ),
      );
      return false;
    } catch (error) {
      this.logError(`Error in playNextOrRecommendations: ${(error as Error).message}`);
      return false;
    }
  }

  private resetState(): void {
    this.state = this.getInitialState();
  }

  private getInitialState(): PlayerState {
    return {
      connection: null,
      isPlaying: false,
      channelId: null,
      volume: (config.volume?.default ?? 50) * 100,
      currentTrack: null,
      nextTrack: null,
      lastUserTrack: null,
      loop: false,
      pause: false,
      wave: false,
      compressor: config.compressor?.default ?? false,
      normalize: config.normalize?.default ?? false,
      bass: config.equalizer?.bass_default ?? 0,
    };
  }
}
