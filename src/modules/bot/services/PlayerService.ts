import {
	type CommandInteraction,
	type GuildMember,
	PermissionFlagsBits,
	type VoiceChannel,
} from "discord.js";
import { Discord } from "discordx";
import {
	type AudioPlayer,
	AudioPlayerStatus,
	type AudioResource,
	createAudioPlayer,
	createAudioResource,
	type DiscordGatewayAdapterCreator,
	entersState,
	getVoiceConnection,
	joinVoiceChannel,
	NoSubscriberBehavior,
	StreamType,
	type VoiceConnection,
	VoiceConnectionStatus,
} from "@discordjs/voice";

import { bot } from "../bot.js";
import {
	DEFAULT_VOLUME,
	EMPTY_CHANNEL_CHECK_INTERVAL,
	RECONNECTION_TIMEOUT,
} from "../config.js";
import logger from "../../../utils/logger.js";
import type { CommandService, QueueService, Track } from "./index.js";

import { getAudioDurationInSeconds } from "get-audio-duration";
import pathToFfmpeg from "ffmpeg-ffprobe-static";
import type { PlayerState } from "../types/index.js";

@Discord()
export default class PlayerService {
	private readonly player: AudioPlayer;
	public state: PlayerState;
	private timers: Record<string, NodeJS.Timeout | null> = {};

	constructor(
		private readonly queueService: QueueService,
		private readonly commandService: CommandService,
		public readonly guildId: string,
	) {
		this.player = createAudioPlayer({
			behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
		});
		this.state = this.getInitialState();
		this.setupPlayerEvents();
	}

	/**
	 * Gets the initial state of the player
	 * @returns {PlayerState} Initial state
	 */
	private getInitialState(): PlayerState {
		return {
			connection: null,
			isPlaying: false,
			resource: null,
			channelId: null,
			volume: DEFAULT_VOLUME,
			currentTrack: null,
			nextTrack: null,
			lastTrack: null,
			loop: false,
			wave: false,
		};
	}

	/**
	 * Sets up player events
	 */
	private setupPlayerEvents(): void {
		this.player.on("error", (error) => {
			logger.error(bot.locale.t("player.status.error"), error);
			this.handleTrackEnd();
		});
		this.player.on(AudioPlayerStatus.Idle, () => this.handleTrackEnd());
	}

	/**
	 * Initializes player properties
	 * @param {keyof Pick<PlayerState, "loop" | "wave" | "volume" | "currentTrack">} property - Property to initialize
	 */
	public async initialize(
		property: keyof Pick<
			PlayerState,
			"loop" | "wave" | "volume" | "currentTrack"
		>,
	): Promise<void> {
		const getters = {
			loop: () => this.queueService.getLoop(this.guildId),
			wave: () => this.queueService.getWaveStatus(this.guildId),
			volume: () => this.queueService.getVolume(this.guildId),
			currentTrack: () => this.queueService.getTrack(this.guildId),
		};

		const value =
			(await getters[property]()) ??
			(property === "volume"
				? DEFAULT_VOLUME
				: this.queueService.getVolume(this.guildId));

		if (property === "volume") {
			this.state[property] = value as number;
			await this.queueService.setVolume(this.guildId, value as number);
		} else if (property === "currentTrack") {
			this.state[property] = value as Track;
		} else {
			this.state[property] = value as boolean;
		}
	}

	/**
	 * Plays or queues a track
	 * @param {Track} track - Track to play or queue
	 */
	public async playOrQueueTrack(track: Track): Promise<void> {
		try {
			await (this.state.isPlaying
				? this.queueTrack(track)
				: this.playTrack(track));
			if (!this.state.nextTrack) await this.loadNextTrack();
		} catch (error) {
			logger.error(
				`${bot.locale.t("errors.failed_to_play_queue_track")}: ${error}`,
			);
		}
	}

	/**
	 * Skips the current track
	 * @param {CommandInteraction} interaction - Discord command interaction
	 */
	public async skip(interaction: CommandInteraction): Promise<void> {
		if (!this.state.currentTrack) {
			await this.commandService.reply(
				interaction,
				bot.locale.t("player.nothingPlaying"),
			);
			return;
		}

		await this.commandService.reply(
			interaction,
			bot.locale.t("player.skipped"),
		);
		this.state.loop = false;
		await this.queueService.setLoop(this.guildId, false);
		await new Promise((r) => setTimeout(r, 1000));
		await this.playNextTrack();
	}

	/**
	 * Toggles the pause state of the player
	 * @param {CommandInteraction} interaction - Discord command interaction
	 */
	public async togglePause(interaction: CommandInteraction): Promise<void> {
		if (!this.state.connection) return;

		const status = this.player.state.status;
		const actions = {
			[AudioPlayerStatus.Playing]: {
				action: () => this.player.pause(),
				message: bot.locale.t("player.paused"),
				isPlaying: false,
			},
			[AudioPlayerStatus.Paused]: {
				action: () => this.player.unpause(),
				message: bot.locale.t("player.resumed"),
				isPlaying: true,
			},
		} as const;

		const currentAction = actions[status as keyof typeof actions];
		if (currentAction) {
			currentAction.action();
			this.state.isPlaying = currentAction.isPlaying;
			await this.commandService.reply(interaction, currentAction.message);
		}
	}

	/**
	 * Sets the volume of the player
	 * @param {number} volume - Volume to set
	 */
	public async setVolume(volume: number): Promise<void> {
		if (this.player.state.status === AudioPlayerStatus.Playing) {
			await this.smoothVolumeChange(volume / 100, 2000);
			await this.queueService.setVolume(this.guildId, volume);
		}
	}

	/**
	 * Joins a voice channel
	 * @param {CommandInteraction} interaction - Discord command interaction
	 */
	public async joinChannel(interaction: CommandInteraction): Promise<void> {
		const member = interaction.member as GuildMember;
		const voiceChannelId = member.voice.channel?.id;

		if (!voiceChannelId || !this.hasVoiceAccess(member)) {
			await this.commandService.reply(
				interaction,
				bot.locale.t("errors.notInVoiceChannel"),
			);
			return;
		}

		try {
			this.state.channelId = voiceChannelId;
			this.state.connection = await this.establishConnection(
				voiceChannelId,
				interaction,
			);

			const track = await this.queueService.getTrack(this.guildId);
			if (track) await this.playOrQueueTrack(track);

			await Promise.all([this.initialize("volume"), this.initialize("wave")]);
			this.setupDisconnectHandler();
			this.startEmptyCheck();
		} catch (error) {
			logger.error(
				bot.locale.t("errors.voice_connection", { error: String(error) }),
			);
			await this.commandService.reply(
				interaction,
				bot.locale.t("errors.joinError"),
			);
			this.reset();
		}
	}

	/**
	 * Establishes a voice connection
	 * @param {string} channelId - Discord channel ID
	 * @param {CommandInteraction} interaction - Discord command interaction
	 * @returns {Promise<VoiceConnection>} Voice connection
	 */
	private async establishConnection(
		channelId: string,
		interaction: CommandInteraction,
	): Promise<VoiceConnection> {
		const existingConnection = getVoiceConnection(this.guildId);
		if (existingConnection) return existingConnection;

		if (!interaction.guild) {
			throw new Error(bot.locale.t("errors.guild_not_found"));
		}

		const connection = joinVoiceChannel({
			channelId,
			guildId: this.guildId,
			adapterCreator: interaction.guild
				.voiceAdapterCreator as DiscordGatewayAdapterCreator,
			selfDeaf: false,
			selfMute: false,
		});

		try {
			await entersState(connection, VoiceConnectionStatus.Ready, 30000);
			connection.subscribe(this.player);
			return connection;
		} catch (error) {
			connection.destroy();
			throw error;
		}
	}

	/**
	 * Smoothly changes the volume of the player
	 * @param {number} target - Target volume
	 * @param {number} duration - Duration of the volume change
	 * @param {boolean} memorize - Whether to memorize the volume
	 * @param {boolean} zero - Whether to start from 0
	 * @returns {Promise<void>} Promise that resolves when the volume change is complete
	 */
	public smoothVolumeChange(
		target: number,
		duration: number,
		memorize: boolean = true,
		zero: boolean = false,
	): Promise<void> {
		return new Promise((resolve) => {
			if (this.timers.volumeChange) {
				clearTimeout(this.timers.volumeChange);
				this.timers.volumeChange = null;
			}

			const start = zero ? 0 : this.state.volume / 100 || 0;
			const diff = target - start;
			const startTime = Date.now();

			if (memorize) this.state.volume = target * 100;

			const animate = () => {
				const elapsed = Date.now() - startTime;
				const progress = Math.min(elapsed / duration, 1);

				const vol = start + diff * progress;
				this.state.resource?.volume?.setVolumeLogarithmic(
					Math.max(0, Math.min(1, vol)),
				);

				if (progress < 1) {
					this.timers.volumeChange = setTimeout(animate, 16);
				} else {
					this.timers.volumeChange = null;
					resolve();
				}
			};

			animate();
		});
	}

	/**
	 * Checks if a member has voice access
	 * @param {GuildMember} member - Guild member
	 * @returns {boolean} Whether the member has voice access
	 */
	private hasVoiceAccess(member: GuildMember): boolean {
		return !!(
			member.voice.channel
				?.permissionsFor(member)
				?.has(PermissionFlagsBits.Connect) && member.voice.channel?.id
		);
	}

	/**
	 * Leaves the voice channel
	 */
	public leaveChannel(): void {
		if (this.state.connection) {
			this.state.connection.destroy();
			this.reset();
			this.updateActivity();
		}
	}

	/**
	 * Updates the activity of the bot
	 * @param {string} activity - Activity to set
	 */
	private updateActivity(activity?: string) {
		if (bot.client.user) {
			bot.client.user.setActivity(activity || "");
		}
	}

	/**
	 * Plays a track
	 * @param {Track} track - Track to play
	 */
	private async playTrack(track: Track): Promise<void> {
		try {
			if (!track) {
				logger.error(bot.locale.t("errors.invalid_track"));
				return;
			}

			if (track.source === "url") {
				if (!track.url) {
					logger.error(bot.locale.t("errors.invalid_track_url"));
					return;
				}
				track.trackId = track.url;
			} else if (!track.trackId) {
				logger.error(bot.locale.t("errors.invalid_track"));
				return;
			}

			this.manageFadeOutTimeout();

			this.state.currentTrack = track;
			if (track.source === "yandex") {
				this.state.lastTrack = this.state.lastTrack || track;
				await this.queueService.setLastTrackID(this.guildId, track.trackId);
			}

			await Promise.all([this.initialize("volume"), this.initialize("wave")]);

			const trackUrl = await this.getTrackUrl(track.trackId, track.source);
			if (!trackUrl) {
				logger.error(
					bot.locale.t("errors.track_url_not_found", {
						trackId: track.trackId || "unknown",
					}),
				);
				return;
			}

			const resource = this.createTrackResource({
				...track,
				url: trackUrl,
			});
			this.setupFadeEffects();

			await new Promise((resolve) => setTimeout(resolve, 1000));
			this.player.play(resource);

			if (!this.state.loop) {
				await this.queueService.logTrackPlay(
					track.requestedBy!,
					track.trackId,
					track.info,
				);
			}

			this.state.isPlaying = true;

			this.updateActivity(track.info);

			await this.setupTrackEndFade({ ...track, url: trackUrl });
		} catch (error) {
			logger.error(
				bot.locale.t("errors.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * Gets the URL of a track
	 * @param {string} trackId - Track ID
	 * @param {string} source - Source of the track
	 * @returns {Promise<string>} URL of the track
	 */
	private async getTrackUrl(trackId: string, source: string): Promise<string> {
		if (source === "url") {
			return trackId;
		}
		const plugin = bot.pluginManager.getPlugin(source);
		return plugin?.getTrackUrl ? await plugin.getTrackUrl(trackId) : "";
	}

	/**
	 * Creates a track resource
	 * @param {Track & { url: string }} track - Track with URL
	 * @returns {AudioResource} Track resource
	 */
	private createTrackResource(track: Track & { url: string }): AudioResource {
		const resource = createAudioResource(track.url, {
			inputType: StreamType.Arbitrary,
			inlineVolume: true,
			silencePaddingFrames: 5,
		});
		resource.volume?.setVolumeLogarithmic(0);
		this.state.resource = resource;
		return resource;
	}

	/**
	 * Sets up fade effects
	 */
	private setupFadeEffects(): void {
		if (this.timers.fadeOut) clearTimeout(this.timers.fadeOut);
		setTimeout(
			() => this.smoothVolumeChange(this.state.volume / 100, 3000, true, true),
			500,
		);
	}

	/**
	 * Manages the fade out timeout
	 * @param {number} duration - Duration of the fade out
	 */
	private manageFadeOutTimeout(duration?: number): void {
		if (this.timers.fadeOut) {
			clearTimeout(this.timers.fadeOut);
			this.timers.fadeOut = null;
			logger.info(bot.locale.t("player.fadeout_cleared"));
		}

		if (duration && duration > 0) {
			this.timers.fadeOut = setTimeout(() => {
				this.smoothVolumeChange(0, 6000, false);
			}, duration);
			logger.info(bot.locale.t("player.fadeout_set", { duration }));
		}
	}

	/**
	 * Sets up the track end fade
	 * @param {Track & { url: string }} track - Track with URL
	 */
	private async setupTrackEndFade(
		track: Track & { url: string },
	): Promise<void> {
		const duration = await this.getDuration(track.url);
		this.manageFadeOutTimeout(duration - 8000);
	}

	/**
	 * Gets the duration of a track
	 * @param {string} url - URL of the track
	 * @returns {Promise<number>} Duration of the track
	 */
	private async getDuration(url: string): Promise<number> {
		return await getAudioDurationInSeconds(
			url,
			pathToFfmpeg.ffprobePath || undefined,
		);
	}

	/**
	 * Queues a track
	 * @param {Track} track - Track to queue
	 */
	private async queueTrack(track: Track): Promise<void> {
		if (this.guildId) {
			await this.queueService.setTrack(this.guildId, track);
		}
	}

	/**
	 * Loads the next track
	 */
	private async loadNextTrack(): Promise<void> {
		if (this.guildId) {
			this.state.nextTrack = await this.queueService.getTrack(this.guildId);
		}
	}

	/**
	 * Plays the next track
	 */
	private async playNextTrack(): Promise<void> {
		if (this.state.loop) {
			await this.playTrack(this.state.lastTrack!);
		} else if (this.state.nextTrack) {
			await this.playTrack(this.state.nextTrack);
			if (!this.state.loop) {
				this.state.nextTrack = null;
				await this.loadNextTrack();
			}
		} else {
			this.reset();
			this.updateActivity();
		}
	}

	/**
	 * Sets up the disconnect handler
	 */
	private setupDisconnectHandler(): void {
		this.state.connection?.on(VoiceConnectionStatus.Disconnected, async () => {
			try {
				await Promise.race([
					entersState(
						this.state.connection!,
						VoiceConnectionStatus.Signalling,
						RECONNECTION_TIMEOUT,
					),
					entersState(
						this.state.connection!,
						VoiceConnectionStatus.Connecting,
						RECONNECTION_TIMEOUT,
					),
				]);
			} catch {
				this.handleDisconnect();
			}
		});
	}

	/**
	 * Handles the disconnect event
	 */
	private handleDisconnect(): void {
		if (this.state.connection) {
			this.state.connection.removeAllListeners();
			this.state.connection.destroy();
		}
		this.reset();
		this.updateActivity();
	}

	/**
	 * Starts the empty channel check
	 */
	private startEmptyCheck(): void {
		if (this.timers.emptyChannelCheck)
			clearInterval(this.timers.emptyChannelCheck);
		this.timers.emptyChannelCheck = setInterval(
			() => this.checkEmpty(),
			EMPTY_CHANNEL_CHECK_INTERVAL,
		);
	}

	/**
	 * Checks if the voice channel is empty
	 */
	private async checkEmpty(): Promise<void> {
		if (!this.state.connection || !this.state.channelId) return;

		try {
			const channel = await this.getVoiceChannel();

			if (!channel) {
				this.handleDisconnect();
				return;
			}

			const membersCount = channel.members.filter((m) => !m.user.bot).size;

			if (membersCount === 0) {
				if (!this.timers.emptyChannel) {
					this.timers.emptyChannel = setTimeout(() => {
						this.leaveChannel();
						this.timers.emptyChannel = null;
					}, 30000);
				}
			} else if (this.timers.emptyChannel) {
				clearTimeout(this.timers.emptyChannel);
				this.timers.emptyChannel = null;
			}
		} catch (error) {
			logger.error(
				bot.locale.t("errors.empty_check", { error: String(error) }),
			);
			this.handleDisconnect();
		}
	}

	/**
	 * Gets the voice channel
	 * @returns {Promise<VoiceChannel | null>} Voice channel or null
	 */
	private async getVoiceChannel(): Promise<VoiceChannel | null> {
		if (!this.state.channelId) {
			logger.error(bot.locale.t("errors.channel_id_null"));
			return null;
		}

		const guild = await bot.client.guilds.fetch(this.guildId);
		const channel = await guild.channels.fetch(this.state.channelId);
		return channel as VoiceChannel;
	}

	/**
	 * Handles the track end event
	 */
	private handleTrackEnd = async (): Promise<void> => {
		this.state.lastTrack = this.state.currentTrack;
		this.state.isPlaying = false;
		this.state.currentTrack = null;
		await this.playNextTrack();
	};

	/**
	 * Resets the player state
	 */
	private reset(): void {
		this.manageFadeOutTimeout();
		this.state.connection = null;
		this.state.currentTrack = this.state.nextTrack = null;
		this.state.isPlaying = false;

		Object.values(this.timers).forEach((timer) => {
			if (timer) clearTimeout(timer);
		});
		this.timers = {};
	}
}
