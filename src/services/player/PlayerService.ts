import type { CommandInteraction } from "discord.js";
import {
	AudioPlayerStatus,
	createAudioPlayer,
	createAudioResource,
	NoSubscriberBehavior,
} from "@discordjs/voice";
import { EventEmitter } from "eventemitter3";

import { AudioService } from "../audio/AudioService.js";
import { TrackManager } from "./TrackManager.js";
import { ConnectionManager } from "./ConnectionManager.js";
import type { PlayerState } from "../../types/audio.js";
import { PlayerServiceEvents } from "../../types/audio.js";
import config from "../../../config.json" with { type: "json" };
import type { Bot } from "../../bot.js";
import { PlayerQueue } from "./PlayerQueue.js";
import { PlayerEffects } from "./PlayerEffects.js";
import type { Track } from "../../types/index.js";

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

	constructor(
		public readonly guildId: string,
		private readonly bot: Bot,
	) {
		super();

		this.audioService = new AudioService();
		this.trackManager = new TrackManager(bot);
		this.connectionManager = new ConnectionManager(guildId, bot);
		this.state = this.getInitialState();
		const savedVolume = this.bot.queueService.getVolume(this.guildId);
		if (savedVolume !== undefined) {
			this.state.volume = savedVolume;
		}
		this.queue = new PlayerQueue(
			guildId,
			bot,
			this.emit.bind(this),
			this.trackManager,
		);
		this.effects = new PlayerEffects(this.audioService);
		this.state.lastUserTrack = this.bot.queueService.getLastTrack(this.guildId);

		this.setupEvents();
	}

	private setupEvents(): void {
		this.player.on(AudioPlayerStatus.Playing, () => {
			this.bot?.logger.debug(
				"[PlayerService] AudioPlayerStatus.Playing event received",
			);
			this.state.isPlaying = true;
			this.state.pause = false;
			this.emit(PlayerServiceEvents.PLAYING);
		});

		this.player.on(AudioPlayerStatus.Paused, () => {
			this.bot?.logger.debug(
				"[PlayerService] AudioPlayerStatus.Paused event received",
			);
			this.state.isPlaying = false;
			this.state.pause = true;
			this.emit(PlayerServiceEvents.PAUSED);
		});

		this.player.on(AudioPlayerStatus.Idle, () => {
			this.bot?.logger.debug(
				"[PlayerService] AudioPlayerStatus.Idle event received",
			);
			this.handleTrackEnd();
		});

		this.player.on("error", (error) => {
			this.bot?.logger.error(
				"[PlayerService] AudioPlayer error event received:",
				error,
			);
			this.handleTrackEnd();
		});

		this.audioService.on("volumeChanged", (volume: number) =>
			this.emit(PlayerServiceEvents.VOLUME_CHANGED, volume),
		);

		this.connectionManager.on("connected", (channelId: string) => {
			this.bot.logger.debug(
				`[PlayerService] Connected to channel ${channelId}`,
			);
			this.state.channelId = channelId;
			this.state.connection = this.connectionManager.getConnection();
			this.emit(PlayerServiceEvents.CONNECTED, channelId);
		});

		this.connectionManager.on("disconnected", () => {
			this.bot?.logger.debug("[PlayerService] Disconnected event received");
			this.handleDisconnection();
		});

		// Handle errors from the audio pipeline to avoid unhandled 'error' events
		this.audioService.on("error", async (_error: Error) => {
			// this.bot?.logger.error("[PlayerService] AudioService error:", error);
			try {
				// Stop current playback gracefully and move to next track
				this.player.stop();
				const lastTrack = this.state.currentTrack;

				await this.queue.playNextTrack(
					lastTrack,
					this.state.loop,
					this.playTrack.bind(this),
					() =>
						this.queue.tryPlayRecommendations(
							this.bot.queueService.getLastTrack(this.guildId),
							this.playTrack.bind(this),
						),
				);
			} catch (e) {
				this.bot?.logger.error(
					"[PlayerService] Failed to recover from AudioService error:",
					e,
				);
			}
		});

		this.audioService.on("debug", (message: string) => {
			this.bot?.logger.debug(message);
		});
	}

	private handleDisconnection(): void {
		this.bot?.logger.debug("[PlayerService] handleDisconnection called");
		this.player.stop();
		this.resetState();
		this.emit(PlayerServiceEvents.DISCONNECTED);
	}

	async playOrQueueTrack(track: Track, interaction?: CommandInteraction) {
		if (!track) return;

		this.bot?.logger.debug(
			`[PlayerService] playOrQueueTrack called for track: ${track.info}`,
		);
		this.bot?.logger.debug(
			`[PlayerService] Current state - isPlaying: ${this.state.isPlaying}, isConnected: ${!!this.connectionManager.getConnection()}`,
		);

		const isConnected = !!this.connectionManager.getConnection();
		if (!isConnected && interaction) {
			this.bot?.logger.debug(`[PlayerService] Not connected, joining channel`);
			await this.joinChannel(interaction);
		}
		if (this.state.isPlaying) {
			this.bot?.logger.debug(
				`[PlayerService] Currently playing, adding to queue`,
			);
			await this.queue.queueTrack(track);
		} else {
			this.bot?.logger.debug(`[PlayerService] Not playing, starting playback`);
			const success = await this.playTrack(track);
			if (!success) return;
		}
		if (!this.state.nextTrack) {
			this.bot?.logger.debug(`[PlayerService] Loading next track for display`);
			this.state.nextTrack = await this.queue.peekNextTrack();
		}
	}

	async skip(): Promise<void> {
		try {
			this.bot?.logger.debug("[PlayerService] skip called");
			if (this.fadeOutTimer) {
				clearTimeout(this.fadeOutTimer);
				this.fadeOutTimer = null;
			}
			this.state.loop = false;
			this.bot?.queueService.setLoop(this.guildId, false);
			await this.effects.setVolume(0, 1000, false);
			await new Promise((resolve) => setTimeout(resolve, 1000));
			this.player.stop();
			await this.playNextOrRecommendations();
		} catch (error) {
			this.bot?.logger.error("Failed to skip track:", error);
		}
	}

	async playTrack(track: Track): Promise<boolean> {
		try {
			this.bot?.logger.debug(
				`[PlayerService] playTrack called for track: ${track.info}`,
			);

			this.connectionManager.resetIdleTimeout();

			let trackUrl = await this.trackManager.getTrackUrl(
				track.trackId,
				track.source,
			);
			if (!trackUrl) return await this.playNextOrRecommendations();

			const streamResult = await this.audioService.createAudioStreamForDiscord(trackUrl);

			const { stream, type } = streamResult;

			const resource = createAudioResource(stream, { inputType: type });

			this.state.currentTrack = track;
			if (!track.generation)
				this.bot.queueService.setLastTrack(this.guildId, track);

			this.player.play(resource);
			await this.effects.fadeIn(this.state.volume);

			const durationMs =
				track.durationMs ?? (await this.trackManager.getDuration(trackUrl));
			const scheduledForTrackId = track.trackId;

			this.fadeOutTimer = await this.effects.scheduleFadeOut(
				durationMs,
				async () => {
					if (this.state.currentTrack?.trackId !== scheduledForTrackId) return;
					await this.effects.setVolume(0, 2000, false);
				},
			);

			this.emit(PlayerServiceEvents.TRACK_STARTED, track);
			this.bot?.logger.debug(
				`[PlayerService] Track started successfully: ${track.info}`,
			);
			return true;
		} catch (error) {
			return await this.playNextOrRecommendations();
		}
	}

	async togglePause(): Promise<void> {
		if (!this.state.connection) return;

		try {
			this.bot?.logger.debug("[PlayerService] togglePause called");
			const status = this.player.state.status;
			this.bot?.logger.debug(
				`[PlayerService] Current player status: ${status}`,
			);

			switch (status) {
				case AudioPlayerStatus.Playing:
					this.bot?.logger.debug("[PlayerService] Pausing player");
					this.player.pause();
					break;
				case AudioPlayerStatus.Paused:
					this.bot?.logger.debug("[PlayerService] Unpausing player");
					this.player.unpause();
					break;
			}
		} catch (error) {
			this.bot?.logger.error("Failed to toggle pause:", error);
		}
	}

	private async handleTrackEnd() {
		this.bot?.logger.debug("[PlayerService] handleTrackEnd called");

		if (this.fadeOutTimer) {
			clearTimeout(this.fadeOutTimer);
			this.fadeOutTimer = null;
		}
		const prevTrack = this.state.currentTrack;
		this.emit(PlayerServiceEvents.TRACK_ENDED, prevTrack);

		this.bot?.logger.debug(
			`[PlayerService] Previous track: ${prevTrack?.info || "unknown"}`,
		);
		this.bot?.logger.debug(`[PlayerService] Loop enabled: ${this.state.loop}`);

		this.state.currentTrack = null;
		this.state.isPlaying = false;
		this.state.pause = false;

		await this.playNextOrRecommendations();
	}

	async joinChannel(interaction: CommandInteraction) {
		this.bot?.logger.debug("[PlayerService] joinChannel called");
		const connection = await this.connectionManager.joinChannel(interaction);
		connection.subscribe(this.player);
		this.bot?.logger.debug(
			"[PlayerService] Channel joined and player subscribed",
		);
	}

	async destroy(): Promise<void> {
		try {
			this.bot.logger.debug("[PlayerService] Destroying player service");

			if (this.fadeOutTimer) {
				clearTimeout(this.fadeOutTimer);
				this.fadeOutTimer = null;
			}

			this.player.stop();
			this.connectionManager.destroy();
			this.removeAllListeners();
			this.resetState();

			this.bot.logger.debug("[PlayerService] Player service destroyed");
		} catch (error) {
			this.bot?.logger.error("Failed to destroy player service:", error);
		}
	}

	private async playNextOrRecommendations(): Promise<boolean> {
		const lastTrack = this.state.currentTrack;
		await this.queue.playNextTrack(
			lastTrack,
			this.state.loop,
			this.playTrack.bind(this),
			() =>
				this.queue.tryPlayRecommendations(
					this.bot.queueService.getLastTrack(this.guildId),
					this.playTrack.bind(this),
				),
		);
		return false;
	}

	private resetState() {
		this.bot?.logger.debug("[PlayerService] resetState called");
		this.state = this.getInitialState();
	}

	private getInitialState(): PlayerState {
		this.bot?.logger.debug("[PlayerService] getInitialState called");
		return {
			connection: null,
			isPlaying: false,
			channelId: null,
			volume: config.volume.default * 100,
			currentTrack: null,
			nextTrack: null,
			lastUserTrack: null,
			loop: false,
			pause: false,
			wave: false,
			lowPassFrequency: 0,
			lowPassQ: 0.707,
			compressor: config.compressor.default || false,
			normalize: config.normalize.default || false,
			bass: config.equalizer.bass_default,
		};
	}
}
