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
import {
  PlayerStatus,
  type PlayerState,
  PlayerServiceEvents,
} from "../../types/audio.js";
import config from "../../../config.json" with { type: "json" };
import { DEFAULT_FADEIN, DEFAULT_FADEOUT } from "../../utils/constants.js";
import type { Track } from "../../types/index.js";
import type { MusicServicePlugin } from "../../interfaces/index.js";

export interface QueueServiceSubset {
  clearWaveState(guildId: string): void;
  setTrack(guildId: string, track: Track): Promise<void>;
  getTrack(guildId: string): Promise<Track | null>;
  peekTrack(guildId: string): Promise<Track | null>;
  getWave(guildId: string): boolean;
  getVolume(guildId: string): number;
  getLastTrack(guildId: string): Track | null;
  setLastTrack(guildId: string, track?: Track): void;
}

interface PluginManagerSubset {
  getPlugin(name: string): MusicServicePlugin | undefined;
}

interface PlayerServiceDeps {
  logger: Logger;
  queueService: QueueServiceSubset;
  client: {
    user?: { id: string } | null;
    guilds: {
      fetch(
        id: string,
      ): Promise<{ channels: { fetch(): Promise<Map<string, any>> } }>;
    };
  };
  pluginManager: PluginManagerSubset;
  t: (
    key: string,
    params?: Record<string, unknown>,
    lang?: string | boolean,
  ) => string;
}

export default class PlayerService extends EventEmitter {
  private readonly player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  public readonly audioService: AudioService;
  private trackManager: TrackManager;
  public connectionManager: ConnectionManager;
  private fadeOutTimer: NodeJS.Timeout | null = null;
  public state: PlayerState;
  public status: PlayerStatus = PlayerStatus.IDLE;

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
    await this.setVolume(0, 1000, false);
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

    if (!guildId?.trim()) {
      throw new Error("PlayerService requires a valid guildId");
    }

    this.audioService = new AudioService();
    this.trackManager = new TrackManager(
      deps.logger,
      deps.pluginManager,
      deps.t,
    );
    this.connectionManager = new ConnectionManager(
      guildId,
      deps.logger,
      deps.client,
    );
    this.state = this.getInitialState();

    const savedVolume = deps.queueService?.getVolume?.(guildId);
    if (typeof savedVolume === "number") {
      this.state.volume = Math.max(0, Math.min(200, savedVolume));
    }

    this.state.lastUserTrack =
      deps.queueService?.getLastTrack?.(guildId) ?? null;

    this.setupEvents();
  }

  /* ---- public setters (for PlayerManager) ---- */

  setStateVolume(volume: number): void {
    this.state.volume = Math.max(0, Math.min(200, volume));
  }

  setLoop(loop: boolean): void {
    this.state.loop = loop;
  }

  setWave(wave: boolean): void {
    this.state.wave = wave;
  }

  /* ---- audio effects (was PlayerEffects) ---- */

  async fadeIn(targetVolume: number): Promise<void> {
    const volume = Math.max(0, Math.min(100, targetVolume)) / 100;
    this.audioService.setVolumeFast(0, false);
    await this.audioService.setVolume(volume, DEFAULT_FADEIN, true);
  }

  async scheduleFadeOut(
    duration: number,
    action: () => Promise<void>,
  ): Promise<NodeJS.Timeout | null> {
    try {
      if (!duration || typeof duration !== "number" || duration <= 0) {
        return null;
      }

      if (duration > DEFAULT_FADEOUT) {
        const delay = duration - DEFAULT_FADEOUT;
        this.fadeOutTimer = setTimeout(async () => {
          try {
            await action();
          } catch (error) {
            this.logError(
              `Error in scheduled fadeOut: ${(error as Error).message}`,
            );
          }
        }, delay);

        return this.fadeOutTimer;
      }
    } catch (error) {
      this.logError(`Error scheduling fadeOut: ${(error as Error).message}`);
    }

    return null;
  }

  async setVolume(volume: number, duration = 2000, set = true): Promise<void> {
    const normalizedVolume = Math.max(0, Math.min(100, volume)) / 100;
    await this.audioService.setVolume(normalizedVolume, duration, set);
  }

  /* ---- queue logic (was PlayerQueue) ---- */

  private async queueTrack(track: Track | null): Promise<void> {
    if (!track) {
      this.deps.logger?.warn?.("[PlayerService] Attempted to queue null track");
      return;
    }

    this.logDebug(`Queueing track: ${track.info}`);

    try {
      this.deps.queueService?.clearWaveState?.(this.guildId);

      if (!this.guildId) {
        this.deps.logger?.warn?.("[PlayerService] No guildId for queueTrack");
        return;
      }

      await this.deps.queueService?.setTrack?.(this.guildId, {
        ...track,
        priority: true,
      });

      this.emit(PlayerServiceEvents.TRACK_QUEUED, track);
    } catch (error) {
      this.logError(`Error queueing track: ${(error as Error).message}`);
    }
  }

  private async loadNextTrack(): Promise<Track | null> {
    if (!this.guildId) {
      return null;
    }

    try {
      const nextTrack = await this.deps.queueService?.getTrack?.(this.guildId);
      return nextTrack ?? null;
    } catch (error) {
      this.logError(`Error loading next track: ${(error as Error).message}`);
      return null;
    }
  }

  private async peekNextTrack(): Promise<Track | null> {
    if (!this.guildId) {
      return null;
    }

    try {
      const nextTrack = await this.deps.queueService?.peekTrack?.(this.guildId);
      return nextTrack ?? null;
    } catch (error) {
      this.logError(`Error peeking next track: ${(error as Error).message}`);
      return null;
    }
  }

  private async getNextTrack(
    currentTrack: Track | null,
    loop: boolean,
  ): Promise<Track | null> {
    if (loop && currentTrack && !currentTrack.generation) {
      this.logDebug(`Replaying track due to loop: ${currentTrack.info}`);
      return currentTrack;
    }

    const nextTrack = await this.loadNextTrack();
    if (nextTrack) {
      this.logDebug(`Playing next queued track: ${nextTrack.info}`);
      this.deps.queueService?.clearWaveState?.(this.guildId);
      return nextTrack;
    }

    return null;
  }

  private async getRecommendation(
    lastTrack: Track | null,
  ): Promise<Track | null> {
    if (!lastTrack?.trackId) {
      return null;
    }

    const waveEnabled = this.deps.queueService?.getWave?.(this.guildId);
    if (!waveEnabled || lastTrack.source !== "yandex") {
      return null;
    }

    this.logDebug(`Fetching recommendations for: ${lastTrack.trackId}`);

    try {
      const recommendations = await this.trackManager.getRecommendations(
        lastTrack.trackId,
      );

      if (recommendations.length > 0) {
        return {
          ...recommendations[0],
          requestedBy: lastTrack.requestedBy,
          waveStatus: true,
        };
      }

      return null;
    } catch (error) {
      this.logError(
        `Error fetching recommendations: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /* ---- event setup ---- */

  private setupEvents(): void {
    this.setupPlayerEvents();
    this.setupAudioServiceEvents();
    this.setupConnectionEvents();
  }

  private setupPlayerEvents(): void {
    this.player.on(AudioPlayerStatus.Playing, () => {
      if (this.status === PlayerStatus.DESTROYED) return;
      this.logDebug("Playing");
      this.status = PlayerStatus.PLAYING;
      this.state.isPlaying = true;
      this.state.pause = false;
      this.emit(PlayerServiceEvents.PLAYING);
    });

    this.player.on(AudioPlayerStatus.Paused, () => {
      if (this.status === PlayerStatus.DESTROYED) return;
      this.logDebug("Paused");
      this.status = PlayerStatus.PAUSED;
      this.state.isPlaying = false;
      this.state.pause = true;
      this.emit(PlayerServiceEvents.PAUSED);
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.status === PlayerStatus.DESTROYED) return;
      this.handleTrackEnd();
    });

    this.player.on("error", (error) => {
      if (this.status === PlayerStatus.DESTROYED) return;

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
      if (this.status !== PlayerStatus.DESTROYED) {
        this.emit(PlayerServiceEvents.VOLUME_CHANGED, volume);
      }
    });

    this.audioService.on("error", async (error: Error) => {
      if (
        this.status === PlayerStatus.DESTROYED ||
        this.status === PlayerStatus.TRANSITIONING
      )
        return;

      if (error.message.includes("Premature close")) {
        this.logDebug("Ignoring premature close in AudioService");
        return;
      }

      this.logError("AudioService error:");

      this.status = PlayerStatus.TRANSITIONING;
      try {
        await this.recoverFromAudioError();
      } catch (e) {
        this.logError(
          `Failed to recover from error: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        if (this.status === PlayerStatus.TRANSITIONING) {
          this.status = PlayerStatus.IDLE;
        }
      }
    });

    this.audioService.on("debug", (message: string) => {
      this.deps.logger?.debug?.(message);
    });
  }

  private setupConnectionEvents(): void {
    this.connectionManager.on("connected", (channelId: string) => {
      if (this.status === PlayerStatus.DESTROYED) return;
      this.logDebug(`Connected to ${channelId}`);
      this.state.channelId = channelId;
      this.state.connection = this.connectionManager.getConnection();
      this.emit(PlayerServiceEvents.CONNECTED, channelId);
    });

    this.connectionManager.on("disconnected", () => {
      if (this.status === PlayerStatus.DESTROYED) return;
      this.handleDisconnection();
    });
  }

  private handleDisconnection(): void {
    if (this.status === PlayerStatus.DESTROYED) return;
    this.logDebug("Disconnected");
    this.player.stop();
    this.resetState();
    this.emit(PlayerServiceEvents.DISCONNECTED);
  }

  /* ---- public commands ---- */

  async playOrQueueTrack(
    track: Track | null,
    interaction?: CommandInteraction,
  ): Promise<void> {
    if (!track || this.status === PlayerStatus.DESTROYED) return;
    this.logDebug(`playOrQueueTrack: ${track.info}`);

    try {
      const isConnected = !!this.connectionManager.getConnection();
      if (!isConnected && interaction) {
        await this.joinChannel(interaction);
      }

      if (this.state.isPlaying) {
        await this.queueTrack(track);
      } else {
        await this.playTrack(track);
      }

      if (!this.state.nextTrack) {
        this.state.nextTrack = await this.peekNextTrack();
      }
    } catch (error) {
      this.logError(`Error in playOrQueueTrack: ${(error as Error).message}`);
    }
  }

  async skip(): Promise<void> {
    if (
      this.status === PlayerStatus.DESTROYED ||
      this.status === PlayerStatus.TRANSITIONING
    )
      return;

    this.status = PlayerStatus.TRANSITIONING;
    try {
      this.logDebug("Skipping track");
      await this.performFadeOutAndStop();
    } catch (error) {
      this.logError(`Error in skip: ${(error as Error).message}`);
    } finally {
      if (this.status === PlayerStatus.TRANSITIONING) {
        this.status = PlayerStatus.IDLE;
      }
    }
  }

  async playTrack(track: Track | null): Promise<boolean> {
    if (!track || this.status === PlayerStatus.DESTROYED) return false;

    try {
      this.logDebug(`Playing: ${track.info}`);
      this.connectionManager.resetIdleTimeout();

      const trackUrl = await this.trackManager.getTrackUrl(
        track.trackId,
        track.source,
      );

      if (!trackUrl) {
        this.deps.logger?.warn?.("[PlayerService] No track URL found");
        return await this.playNextOrRecommendations();
      }

      const plugin = this.deps.pluginManager.getPlugin(track.source);
      const headers = plugin?.getApiHeaders?.(trackUrl) ?? {};
      const streamResult = await this.audioService.createAudioStreamForDiscord(
        trackUrl,
        {
          headers,
        },
      );
      const { stream, type } = streamResult;
      const nodeStream = Readable.fromWeb(stream as any);
      const resource = createAudioResource(nodeStream, { inputType: type });

      this.state.currentTrack = track;
      if (!track.generation) {
        this.deps.queueService?.setLastTrack?.(this.guildId, track);
      }

      this.player.play(resource);
      await this.fadeIn(this.state.volume);

      const durationMs =
        track.durationMs ?? (await this.trackManager.getDuration(trackUrl));
      const scheduledForTrackId = track.trackId;

      this.fadeOutTimer = await this.scheduleFadeOut(durationMs, async () => {
        if (this.state.currentTrack?.trackId === scheduledForTrackId) {
          await this.setVolume(0, 2000, false);
          await this.sleep(4000);
          if (this.state.currentTrack?.trackId === scheduledForTrackId) {
            this.logDebug("Track did not end after fade-out, forcing stop");
            this.player.stop();
          }
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
    if (!this.state.connection || this.status === PlayerStatus.DESTROYED)
      return;

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
    if (this.status === PlayerStatus.DESTROYED) return;

    this.clearFadeTimer();

    const prevTrack = this.state.currentTrack;
    this.state.currentTrack = null;
    this.state.isPlaying = false;
    this.state.pause = false;

    this.emit(PlayerServiceEvents.TRACK_ENDED, prevTrack);
    await this.playNextOrRecommendations();
  }

  async joinChannel(interaction: CommandInteraction): Promise<void> {
    if (this.status === PlayerStatus.DESTROYED) return;

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
    if (this.status === PlayerStatus.DESTROYED) return;

    try {
      this.logDebug("Destroying");
      this.status = PlayerStatus.DESTROYED;

      this.clearFadeTimer();

      this.player.stop();
      await this.audioService.destroy();
      this.connectionManager.destroy();
      this.trackManager.clearCache();
      this.removeAllListeners();
      this.resetState();
    } catch (error) {
      this.logError(`Error destroying: ${(error as Error).message}`);
    }
  }

  private async playNextOrRecommendations(): Promise<boolean> {
    this.status = PlayerStatus.TRANSITIONING;
    try {
      const lastTrack = this.state.currentTrack;
      const nextTrack = await this.getNextTrack(lastTrack, this.state.loop);
      if (nextTrack) {
        return await this.playTrack(nextTrack);
      }

      const recommendation = await this.getRecommendation(
        this.deps.queueService?.getLastTrack?.(this.guildId) ?? null,
      );
      if (recommendation) {
        return await this.playTrack(recommendation);
      }

      this.emit(PlayerServiceEvents.QUEUE_EMPTY);
      return false;
    } catch (error) {
      this.logError(
        `Error in playNextOrRecommendations: ${(error as Error).message}`,
      );
      return false;
    } finally {
      if (this.status === PlayerStatus.TRANSITIONING) {
        this.status = PlayerStatus.IDLE;
      }
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
      volume: (config.audio.volume?.default ?? 50) * 100,
      currentTrack: null,
      nextTrack: null,
      lastUserTrack: null,
      loop: false,
      pause: false,
      wave: false,
      compressor: config.audio.effects?.compressor ?? false,
      normalize: config.audio.effects.normalize ?? false,
      bass: config.audio.effects.bass.default ?? 0,
    };
  }
}
