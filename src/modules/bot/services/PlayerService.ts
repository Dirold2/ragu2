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
import type { CommandService, QueueService, Track } from "./index.js";

import { getAudioDurationInSeconds } from "get-audio-duration";
import pathToFfmpeg from "ffmpeg-ffprobe-static";
import type { PlayerState } from "../types/index.js";
import { EventEmitter } from "events";

/**
 * @en Interface for player timers.
 * @ru Интерфейс для таймеров плеера.
 */
interface PlayerTimers {
	emptyChannelInterval: NodeJS.Timeout | null;
	emptyChannelTimeout: NodeJS.Timeout | null;
	fadeOut: NodeJS.Timeout | null;
}

@Discord()
export default class PlayerService extends EventEmitter {
	private readonly player: AudioPlayer = createAudioPlayer({
		behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
	});

	private timers: PlayerTimers = {
		emptyChannelInterval: null,
		emptyChannelTimeout: null,
		fadeOut: null,
	};

	public state: PlayerState = this.getInitialState();
	private disconnectHandler: ((...args: any[]) => void) | null = null;

	constructor(
		private readonly queueService: QueueService,
		private readonly commandService: CommandService,
		public readonly guildId: string,
	) {
		super();
		this.setupPlayerEvents();
	}

	/**
	 * @en Gets the initial state of the player.
	 * @ru Возвращает начальное состояние плеера.
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
	 * @en Sets up player events.
	 * @ru Устанавливает события плеера.
	 */
	private setupPlayerEvents(): void {
		this.player.on("error", (error) => {
			bot.logger.error(bot.locale.t("player.status.error"), error);
			void this.handleTrackEnd();
		});
		this.player.on(AudioPlayerStatus.Idle, () => void this.handleTrackEnd());
	}

	/**
	 * @en Initializes player properties.
	 * @ru Инициализирует свойства плеера.
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
			wave: () => this.queueService.getWave(this.guildId),
			volume: () => this.queueService.getVolume(this.guildId),
			currentTrack: () => this.queueService.getTrack(this.guildId),
		};

		let value: Track | boolean | number | null = await getters[property]();

		if (value === null && property === "volume") {
			value = DEFAULT_VOLUME;
		}

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
	 * @en Plays or queues a track.
	 * @ru Проигрывает или добавляет трек в очередь.
	 * @param {Track} track - Track to play or queue
	 */
	public async playOrQueueTrack(track: Track): Promise<void> {
		try {
			if (this.state.isPlaying) {
				await this.queueTrack(track);
			} else {
				await this.playTrack(track);
			}

			if (!this.state.nextTrack) {
				await this.loadNextTrack();
			}
		} catch (error) {
			bot.logger.error(
				`${bot.locale.t("errors.failed_to_play_queue_track")}: ${error}`,
			);
		}
	}

	/**
	 * @en Skips the current track.
	 * @ru Пропускает текущий трек.
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
		await this.smoothVolumeChange(0, 1500);
		await new Promise((r) => setTimeout(r, 1000));
		await this.playNextTrack();
	}

	/**
	 * @en Toggles the pause state of the player.
	 * @ru Переключает состояние паузы плеера.
	 * @param {CommandInteraction} interaction - Discord command interaction
	 */
	public async togglePause(interaction: CommandInteraction): Promise<void> {
		if (!this.state.connection) return;

		const status = this.player.state.status;
		let message: string | undefined;
		let isPlaying: boolean | undefined;

		switch (status) {
			case AudioPlayerStatus.Playing:
				this.player.pause();
				message = bot.locale.t("player.paused");
				isPlaying = false;
				break;
			case AudioPlayerStatus.Paused:
				this.player.unpause();
				message = bot.locale.t("player.resumed");
				isPlaying = true;
				break;
		}

		if (message && isPlaying !== undefined) {
			this.state.isPlaying = isPlaying;
			await this.commandService.reply(interaction, message);
		}
	}

	/**
	 * @en Sets the volume of the player.
	 * @ru Устанавливает громкость плеера.
	 * @param {number} volume - Volume to set
	 */
	public async setVolume(volume: number): Promise<void> {
		if (this.player.state.status === AudioPlayerStatus.Playing) {
			await this.smoothVolumeChange(volume / 100, 2000);
			await this.queueService.setVolume(this.guildId, volume);
		}
	}

	/**
	 * @en Joins a voice channel.
	 * @ru Присоединяется к голосовому каналу.
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
			bot.logger.error(
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
	 * @en Establishes a voice connection.
	 * @ru Устанавливает голосовое соединение.
	 * @param {string} channelId - Discord channel ID
	 * @param {CommandInteraction} interaction - Discord command interaction
	 * @returns {Promise<VoiceConnection>} Voice connection
	 */
	private async establishConnection(
		channelId: string,
		interaction: CommandInteraction,
	): Promise<VoiceConnection> {
		let connection = getVoiceConnection(this.guildId);
		if (connection) return connection;

		if (!interaction.guild) {
			throw new Error(bot.locale.t("errors.guild_not_found"));
		}

		connection = joinVoiceChannel({
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
	 * @en Smoothly changes the volume of the player.
	 * @ru Плавно изменяет громкость плеера.
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
		return new Promise((resolve, reject) => {
			let animationFrameId: NodeJS.Timeout | null = null;

			const cleanup = () => {
				if (animationFrameId) {
					clearTimeout(animationFrameId);
					animationFrameId = null;
				}
			};

			try {
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
						animationFrameId = setTimeout(animate, 16);
					} else {
						cleanup();
						resolve();
					}
				};

				animate();
			} catch (error) {
				cleanup();
				reject(error);
			}
		});
	}

	/**
	 * @en Checks if a member has voice access.
	 * @ru Проверяет, есть ли у участника доступ к голосовому каналу.
	 * @param {GuildMember} member - Guild member
	 * @returns {boolean} Whether the member has voice access
	 */
	private hasVoiceAccess(member: GuildMember): boolean {
		const voiceChannel = member.voice.channel;
		return !!(
			voiceChannel?.permissionsFor(member)?.has(PermissionFlagsBits.Connect) &&
			voiceChannel.id
		);
	}

	/**
	 * @en Leaves the voice channel.
	 * @ru Покидает голосовой канал.
	 */
	public leaveChannel(): void {
		if (this.state.connection) {
			this.state.connection.destroy();
			this.reset();
			this.updateActivity();
		}
	}

	/**
	 * @en Updates the activity of the bot.
	 * @ru Обновляет активность бота.
	 * @param {string} activity - Activity to set
	 */
	private updateActivity(activity?: string) {
		bot.client.user?.setActivity(activity || "");
	}

	/**
	 * @en Plays a track.
	 * @ru Проигрывает трек.
	 * @param {Track} track - Track to play
	 */
	private async playTrack(track: Track): Promise<void> {
		if (!track) {
			bot.logger.error(bot.locale.t("errors.invalid_track"));
			return;
		}

		if (track.source === "url") {
			if (!track.url) {
				bot.logger.error(bot.locale.t("errors.invalid_track_url"));
				return;
			}
			track.trackId = track.url;
		} else if (!track.trackId) {
			bot.logger.error(bot.locale.t("errors.invalid_track"));
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
			bot.logger.error(
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
	}

	/**
	 * @en Gets the URL of a track.
	 * @ru Получает URL трека.
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
	 * @en Creates a track resource.
	 * @ru Создает ресурс трека.
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
	 * @en Sets up fade effects.
	 * @ru Устанавливает эффекты затухания.
	 */
	private setupFadeEffects(): void {
		if (this.timers.fadeOut) clearTimeout(this.timers.fadeOut);
		this.timers.fadeOut = setTimeout(
			() =>
				void this.smoothVolumeChange(this.state.volume / 100, 3000, true, true),
			500,
		);
	}

	/**
	 * @en Manages the fade out timeout.
	 * @ru Управляет таймаутом затухания.
	 * @param {number} duration - Duration of the fade out
	 */
	private manageFadeOutTimeout(duration?: number): void {
		if (this.timers.fadeOut) {
			clearTimeout(this.timers.fadeOut);
			this.timers.fadeOut = null;
			bot.logger.debug(bot.locale.t("player.fadeout_cleared"));
		}

		if (duration && duration > 0) {
			this.timers.fadeOut = setTimeout(() => {
				void this.smoothVolumeChange(0, 6000, false);
			}, duration);
			bot.logger.debug(bot.locale.t("player.fadeout_set", { duration }));
		}
	}

	/**
	 * @en Sets up the track end fade.
	 * @ru Устанавливает затухание в конце трека.
	 * @param {Track & { url: string }} track - Track with URL
	 */
	private async setupTrackEndFade(
		track: Track & { url: string },
	): Promise<void> {
		const duration = await this.getDuration(track.url);
		this.manageFadeOutTimeout(duration - 8000);
	}

	/**
	 * @en Gets the duration of a track.
	 * @ru Получает продолжительность трека.
	 * @param {string} url - URL of the track
	 * @returns {Promise<number>} Duration of the track
	 */
	private async getDuration(url: string): Promise<number> {
		try {
			return await getAudioDurationInSeconds(
				url,
				pathToFfmpeg.ffprobePath || undefined,
			);
		} catch (error) {
			bot.logger.error(`Failed to get audio duration for ${url}: ${error}`);
			return 0;
		}
	}

	/**
	 * @en Queues a track.
	 * @ru Добавляет трек в очередь.
	 * @param {Track} track - Track to queue
	 */
	private async queueTrack(track: Track): Promise<void> {
		if (this.guildId) {
			await this.queueService.setTrack(this.guildId, track);
		}
	}

	/**
	 * @en Loads the next track.
	 * @ru Загружает следующий трек.
	 */
	private async loadNextTrack(): Promise<void> {
		if (this.guildId) {
			this.state.nextTrack = await this.queueService.getTrack(this.guildId);
		}
	}

	/**
	 * @en Plays the next track.
	 * @ru Проигрывает следующий трек.
	 */
	private async playNextTrack(): Promise<void> {
		if (this.state.loop && this.state.lastTrack) {
			await this.playTrack(this.state.lastTrack);
		} else if (this.state.nextTrack) {
			await this.playTrack(this.state.nextTrack);
			if (!this.state.loop) {
				this.state.nextTrack = null;
				await this.loadNextTrack();
			}
		} else if (this.state.wave || (this.state.lastTrack && this.state.lastTrack.source === "yandex")) {
			if (this.state.lastTrack) {
				const recommendations = await this.getRecommendations(this.state.lastTrack.trackId);
				if (recommendations.length > 0) {
					await this.playTrack(recommendations[0]);
				} else {
					this.reset();
					this.updateActivity();
				}
			} else {
				this.reset();
				this.updateActivity();
			}
		} else {
			this.reset();
			this.updateActivity();
		}
	}

	/**
	 * @en Gets recommendations for a track.
	 * @ru Получает рекомендации для трека.
	 * @param {string} trackId - Track ID
	 * @returns {Promise<Track[]>} Recommendations
	 */
	private async getRecommendations(trackId: string): Promise<Track[]> {
		const plugin = bot.pluginManager.getPlugin(
			this.state.lastTrack?.source || "",
		);
		const recommendations = plugin?.getRecommendations
			? await plugin.getRecommendations(trackId)
			: [];

		return recommendations.map((rec) => ({
			source: "yandex",
			trackId: rec.id,
			info: `${rec.title} - ${rec.artists.map((a) => a.name).join(", ")}`,
			requestedBy: this.state.lastTrack?.requestedBy,
		}));
	}

	/**
	 * @en Sets up the disconnect handler.
	 * @ru Устанавливает обработчик отключения.
	 */
	private setupDisconnectHandler(): void {
		this.state.connection?.removeAllListeners(
			VoiceConnectionStatus.Disconnected,
		);

		this.disconnectHandler = async () => {
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
		};

		this.state.connection?.on(
			VoiceConnectionStatus.Disconnected,
			this.disconnectHandler,
		);
	}

	/**
	 * @en Handles the disconnect event.
	 * @ru Обрабатывает событие отключения.
	 */
	private handleDisconnect(): void {
		if (this.state.connection) {
			this.state.connection.removeAllListeners();
			this.state.connection.destroy();
			this.state.connection = null;
		}
		this.reset();
		this.updateActivity();
	}

	/**
	 * @en Starts the empty channel check.
	 * @ru Запускает проверку пустого канала.
	 */
	private startEmptyCheck(): void {
		if (this.timers.emptyChannelInterval) {
			clearInterval(this.timers.emptyChannelInterval);
			this.timers.emptyChannelInterval = null;
		}

		this.timers.emptyChannelInterval = setInterval(
			() => void this.checkEmpty(),
			EMPTY_CHANNEL_CHECK_INTERVAL,
		);
	}

	/**
	 * @en Checks if the voice channel is empty.
	 * @ru Проверяет, пустой ли голосовой канал.
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
				if (!this.timers.emptyChannelTimeout) {
					this.timers.emptyChannelTimeout = setTimeout(() => {
						this.leaveChannel();
						this.timers.emptyChannelTimeout = null;
					}, 30000);
				}
			} else {
				if (this.timers.emptyChannelTimeout) {
					clearTimeout(this.timers.emptyChannelTimeout);
					this.timers.emptyChannelTimeout = null;
				}
			}
		} catch (error) {
			bot.logger.error(
				bot.locale.t("errors.empty_check", { error: String(error) }),
			);
			this.handleDisconnect();
		}
	}

	/**
	 * @en Gets the voice channel.
	 * @ru Получает голосовой канал.
	 * @returns {Promise<VoiceChannel | null>} Voice channel or null
	 */
	private async getVoiceChannel(): Promise<VoiceChannel | null> {
		if (!this.state.channelId) {
			bot.logger.error(bot.locale.t("errors.channel_id_null"));
			return null;
		}

		try {
			const guild = await bot.client.guilds.fetch(this.guildId);
			const channel = (await guild.channels.fetch(
				this.state.channelId,
			)) as VoiceChannel;
			return channel;
		} catch (error) {
			bot.logger.error(`Failed to fetch voice channel: ${error}`);
			return null;
		}
	}

	/**
	 * @en Handles the track end event.
	 * @ru Обрабатывает событие окончания трека.
	 */
	private handleTrackEnd = async (): Promise<void> => {
		this.state.lastTrack = this.state.currentTrack;
		this.state.isPlaying = false;
		this.state.currentTrack = null;
		await this.playNextTrack();
	};

	/**
	 * @en Resets the player state.
	 * @ru Сбрасывает состояние плеера.
	 */
	private reset(): void {
		// Clear all timers
		for (const key in this.timers) {
			if (this.timers.hasOwnProperty(key)) {
				const timer = this.timers[key as keyof PlayerTimers];
				if (timer) {
					clearTimeout(timer);
					clearInterval(timer as NodeJS.Timeout);
					this.timers[key as keyof PlayerTimers] = null; // Correctly reset timer properties
				}
			}
		}

		// Reset the state
		this.state = {
			...this.state,
			isPlaying: false,
			currentTrack: null,
			nextTrack: null,
			resource: null,
		};
	}

	/**
	 * @en Destroys the player.
	 * @ru Уничтожает плеер.
	 */
	public async destroy(): Promise<void> {
		try {
			this.player.stop();
			this.removeAllListeners();

			// Clear all timers
			for (const key in this.timers) {
				if (this.timers.hasOwnProperty(key)) {
					const timer = this.timers[key as keyof PlayerTimers];
					if (timer) {
						clearTimeout(timer);
						clearInterval(timer as NodeJS.Timeout);
						this.timers[key as keyof PlayerTimers] = null; // Correctly reset timer properties
					}
				}
			}

			// Cleanup disconnect handler
			if (this.disconnectHandler && this.state.connection) {
				this.state.connection.off(
					VoiceConnectionStatus.Disconnected,
					this.disconnectHandler,
				);
				this.disconnectHandler = null;
			}

			this.reset();
		} catch (error) {
			bot.logger.error(
				bot.locale.t("errors.player.destroy", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	/**
	 * @en Sets the fade out timer.
	 * @ru Устанавливает таймер затухания.
	 * @param {() => void} callback - Callback function
	 * @param {number} duration - Duration in milliseconds
	 */
	protected setFadeOutTimer(callback: () => void, duration: number): void {
		if (this.timers.fadeOut) {
			clearTimeout(this.timers.fadeOut);
		}
		this.timers.fadeOut = setTimeout(callback, duration);
	}

	/**
	 * @en Sets the empty channel timer.
	 * @ru Устанавливает таймер пустого канала.
	 * @param {() => void} callback - Callback function
	 * @param {number} duration - Duration in milliseconds
	 */
	protected setEmptyChannelTimer(callback: () => void, duration: number): void {
		if (this.timers.emptyChannelInterval) {
			clearInterval(this.timers.emptyChannelInterval);
			this.timers.emptyChannelInterval = null;
		}
		this.timers.emptyChannelInterval = setTimeout(callback, duration);
	}
}
