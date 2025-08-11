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
import type { Track, PlayerState } from "../../types/audio.js";
import { PlayerServiceEvents } from "../../types/audio.js";
import config from "../../../config.json" with { type: "json" };
import { ErrorHandler } from "../../utils/errorHandler.js";
import { type Bot } from "../../bot.js";
import { PlayerQueue } from "./PlayerQueue.js";
import { PlayerEffects } from "./PlayerEffects.js";

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
		ErrorHandler.initialize();

		this.audioService = new AudioService();
		this.trackManager = new TrackManager(bot);
		this.connectionManager = new ConnectionManager(guildId, bot);
		this.state = this.getInitialState();
		this.queue = new PlayerQueue(
			guildId,
			bot,
			this.emit.bind(this),
			this.trackManager,
		);
		this.effects = new PlayerEffects(this.audioService);

		this.setupEvents();
	}

	private setupEvents(): void {
		this.player.on(AudioPlayerStatus.Playing, () => {
			this.state.isPlaying = true;
			this.state.pause = false;
			this.emit(PlayerServiceEvents.PLAYING);
		});

		this.player.on(AudioPlayerStatus.Paused, () => {
			this.state.isPlaying = false;
			this.state.pause = true;
			this.emit(PlayerServiceEvents.PAUSED);
		});

		this.player.on(AudioPlayerStatus.Idle, () => {
			this.handleTrackEnd();
		});

		this.player.on("error", () => {
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
			this.handleDisconnection();
		});

		// Handle errors from the audio pipeline to avoid unhandled 'error' events
		this.audioService.on("error", async (error: Error) => {
			this.bot?.logger.error("[PlayerService] AudioService error:", error);
			try {
				// Stop current playback gracefully and move to next track
				this.player.stop();
				await this.audioService.destroyCurrentStreamSafe();
				await this.queue.playNextTrack(
					this.state.currentTrack,
					this.state.loop,
					this.playTrack.bind(this),
					this.tryPlayRecommendations.bind(this),
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
		this.player.stop();
		this.audioService.destroyCurrentStreamSafe();
		this.resetState();
		this.emit(PlayerServiceEvents.DISCONNECTED);
	}

	async playOrQueueTrack(track: Track, interaction?: CommandInteraction) {
		if (!track) return;
		const isConnected = !!this.connectionManager.getConnection();
		if (!isConnected && interaction) {
			await this.joinChannel(interaction);
		}
		if (this.state.isPlaying) {
			await this.queue.queueTrack(track);
		} else {
			const success = await this.playTrack(track);
			if (!success) return;
		}
		if (!this.state.nextTrack) {
			this.state.nextTrack = await this.queue.loadNextTrack();
		}
	}

	async skip(): Promise<void> {
		try {
			this.state.loop = false;
			this.bot?.queueService.setLoop(this.guildId, false);
			await this.effects.setVolume(0, 1000, false);
			await new Promise((resolve) => setTimeout(resolve, 2000));
			this.player.stop();
			await this.audioService.destroyCurrentStreamSafe();
		} catch (error) {
			this.emit(PlayerServiceEvents.ERROR, error);
		}
	}

	async playTrack(track: Track): Promise<boolean> {
		try {
			await this.audioService.destroyCurrentStreamSafe();
			const trackUrl = await this.trackManager.getTrackUrl(
				track.trackId,
				track.source,
			);
			if (!trackUrl) {
				await this.queue.playNextTrack(
					this.state.currentTrack,
					this.state.loop,
					this.playTrack.bind(this),
					this.tryPlayRecommendations.bind(this),
				);
				return false;
			}
			const { stream, type } =
				await this.audioService.createAudioStreamForDiscord(trackUrl);
			const resource = createAudioResource(stream, { inputType: type });
			await this.effects.setVolumeFast(0);
			this.state.currentTrack = track;
			this.player.play(resource);
			await this.effects.fadeIn(this.state.volume);
			this.fadeOutTimer = await this.effects.scheduleFadeOut(
				() => this.trackManager.getDuration(trackUrl),
				() => this.effects.setVolume(0, 2000, false),
			);
			this.emit(PlayerServiceEvents.TRACK_STARTED, track);
			return true;
		} catch (error) {
			await this.queue.playNextTrack(
				this.state.currentTrack,
				this.state.loop,
				this.playTrack.bind(this),
				this.tryPlayRecommendations.bind(this),
			);
			return false;
		}
	}

	async togglePause(): Promise<void> {
		if (!this.state.connection) return;

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
			this.bot?.logger.error("Failed to toggle pause:", error);
		}
	}

	private async handleTrackEnd() {
		if (this.fadeOutTimer) {
			clearTimeout(this.fadeOutTimer);
			this.fadeOutTimer = null;
		}
		const prevTrack = this.state.currentTrack;
		this.state.currentTrack = null;
		this.state.isPlaying = false;
		this.state.pause = false;
		this.emit(PlayerServiceEvents.TRACK_ENDED, prevTrack);
		await this.queue.playNextTrack(
			prevTrack,
			this.state.loop,
			this.playTrack.bind(this),
			this.tryPlayRecommendations.bind(this),
		);
	}

	private async tryPlayRecommendations() {
		await this.queue.tryPlayRecommendations(
			this.state.currentTrack,
			this.playTrack.bind(this),
		);
	}

	async joinChannel(interaction: CommandInteraction) {
		const connection = await this.connectionManager.joinChannel(interaction);
		connection.subscribe(this.player);
	}

	async destroy(): Promise<void> {
		try {
			this.bot.logger.debug("[PlayerService] Destroying player service");

			if (this.fadeOutTimer) {
				clearTimeout(this.fadeOutTimer);
				this.fadeOutTimer = null;
			}

			this.player.stop();
			await this.audioService.destroyCurrentStreamSafe();
			this.connectionManager.destroy();
			this.removeAllListeners();
			this.resetState();

			this.bot.logger.debug("[PlayerService] Player service destroyed");
		} catch (error) {
			this.bot?.logger.error("Failed to destroy player service:", error);
		}
	}

	private resetState() {
		this.state = this.getInitialState();
	}

	private getInitialState(): PlayerState {
		return {
			connection: null,
			isPlaying: false,
			channelId: null,
			volume: config.volume.default * 100,
			currentTrack: null,
			nextTrack: null,
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
