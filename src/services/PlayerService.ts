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
import type { CommandService, Track } from "./index.js";

import { getAudioDurationInSeconds } from "get-audio-duration";
import type { PlayerState } from "../types/index.js";
import { EventEmitter } from "events";

/**
 * @en Interface for player timers.
 * @ru Интерфейс для таймеров плеера.
 */
interface PlayerTimers {
	emptyChannelInterval: ReturnType<typeof setTimeout> | null;
	emptyChannelTimeout: ReturnType<typeof setTimeout> | null;
	fadeOut: ReturnType<typeof setTimeout> | null;
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
			pause: false,
		};
	}

	/**
	 * @en Sets up player events.
	 * @ru Устанавливает события плеера.
	 */
	private setupPlayerEvents(): void {
		this.player.on("error", (error) => {
			bot.logger.error(
				bot.locale.t("messages.playerService.player.status.error"),
				error,
			);
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
			loop: () => bot.queueService.getLoop(this.guildId),
			wave: () => bot.queueService.getWave(this.guildId),
			volume: () => bot.queueService.getVolume(this.guildId),
			currentTrack: () => bot.queueService.getTrack(this.guildId),
		};

		let value: Track | boolean | number | null = await getters[property]();

		if (value === null && property === "volume") {
			value = DEFAULT_VOLUME;
		}

		if (property === "volume") {
			this.state[property] = value as number;
			await bot.queueService.setVolume(this.guildId, value as number);
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
			let success = false;

			if (this.state.isPlaying) {
				await this.queueTrack(track);
				success = true;
			} else {
				success = await this.playTrack(track);
			}

			if (success && !this.state.nextTrack) {
				await this.loadNextTrack();
			}
		} catch (error) {
			bot.logger.error(
				`${bot.locale.t("messages.playerService.errors.failed_to_play_queue_track")}: ${error}`,
			);
		}
	}

	/**
	 * @en Skips the current track.
	 * @ru Пропускает текущий трек.
	 */
	public async skip(): Promise<void> {
		this.state.loop = false;
		await bot.queueService.setLoop(this.guildId, false);
		await this.smoothVolumeChange(0, 1500);
		await new Promise((r) => setTimeout(r, 1000));
		await this.playNextTrack();
	}

	/**
	 * @en Toggles the pause state of the player.
	 * @ru Переключает состояние паузы плеера.
	 */
	public async togglePause(): Promise<void> {
		if (!this.state.connection) return;

		const status = this.player.state.status;
		let isPlaying: boolean | undefined;
		let pause: boolean | undefined;

		switch (status) {
			case AudioPlayerStatus.Playing:
				this.player.pause();
				pause = true;
				isPlaying = false;
				break;
			case AudioPlayerStatus.Paused:
				this.player.unpause();
				pause = false;
				isPlaying = true;
				break;
		}

		if (isPlaying !== undefined && pause !== undefined) {
			this.state.isPlaying = isPlaying;
			this.state.pause = pause;
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
			await bot.queueService.setVolume(this.guildId, volume);
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
				"messages.playerService.errors.not_in_voice_channel",
			);
			return;
		}

		try {
			this.state.channelId = voiceChannelId;
			this.state.connection = await this.establishConnection(
				voiceChannelId,
				interaction,
			);

			const track = await bot.queueService.getTrack(this.guildId);
			if (track) await this.playOrQueueTrack(track);

			await Promise.all([this.initialize("volume"), this.initialize("wave")]);
			this.setupDisconnectHandler();
			this.startEmptyCheck();
		} catch (error) {
			bot.logger.error(
				bot.locale.t("messages.playerService.errors.voice_connection", {
					error: String(error),
				}),
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
			throw new Error(
				bot.locale.t("messages.playerService.errors.guild_not_found"),
			);
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
		if (!this.state.resource?.volume) {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			let animationFrameId: ReturnType<typeof setTimeout> | null = null;

			const start = zero ? 0 : this.state.volume / 100 || 0;
			const diff = target - start;
			const startTime = Date.now();

			if (memorize) this.state.volume = target * 100;

			// Если изменение незначительное или длительность 0, применяем сразу
			if (Math.abs(diff) < 0.01 || duration <= 0) {
				this.state.resource?.volume?.setVolumeLogarithmic(
					Math.max(0, Math.min(1, target)),
				);
				return resolve();
			}

			const animate = () => {
				if (!this.state.resource?.volume) {
					if (animationFrameId) clearTimeout(animationFrameId);
					return resolve();
				}

				const elapsed = Date.now() - startTime;
				const progress = Math.min(elapsed / duration, 1);

				const vol = start + diff * progress;
				this.state.resource.volume.setVolumeLogarithmic(
					Math.max(0, Math.min(1, vol)),
				);

				if (progress < 1) {
					animationFrameId = setTimeout(animate, 16);
				} else {
					if (animationFrameId) clearTimeout(animationFrameId);
					resolve();
				}
			};

			animate();
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
			this.clearAllTimers();
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
	private async playTrack(track: Track): Promise<boolean> {
		if (!track) {
			bot.logger.error(
				bot.locale.t("messages.playerService.errors.invalid_track"),
			);
			return false;
		}

		if (track.source === "url") {
			if (!track.url) {
				bot.logger.error(
					bot.locale.t("messages.playerService.errors.invalid_track_url"),
				);
				return false;
			}
			track.trackId = track.url;
		} else if (!track.trackId) {
			bot.logger.error(
				bot.locale.t("messages.playerService.errors.invalid_track"),
			);
			return false;
		}

		this.manageFadeOutTimeout();

		this.state.currentTrack = track;
		if (track.source === "yandex") {
			this.state.lastTrack = track;
			await bot.queueService.setLastTrackID(this.guildId, track.trackId);
		}

		await Promise.all([this.initialize("volume"), this.initialize("wave")]);

		const trackUrl = await this.getTrackUrl(track.trackId, track.source);
		if (!trackUrl) {
			await this.playNextTrack();
			return false;
		}

		const resource = this.createTrackResource({
			...track,
			url: trackUrl,
		});
		this.setupFadeEffects();

		await new Promise((resolve) => setTimeout(resolve, 1000));
		this.player.play(resource);

		if (!this.state.loop) {
			await bot.queueService.logTrackPlay(
				track.requestedBy!,
				track.trackId,
				track.info,
			);
		}

		this.state.isPlaying = true;
		this.updateActivity(track.info);

		await this.setupTrackEndFade({ ...track, url: trackUrl  });
		return true;
	}

	/**
	 * @en Gets the URL of a track.
	 * @ru Получает URL трека.
	 * @param {string} trackId - Track ID
	 * @param {string} source - Source of the track
	 * @returns {Promise<string | null>} URL of the track or null if not found
	 */
	private async getTrackUrl(
		trackId: string,
		source: string,
	): Promise<string | null> {
		try {
			if (source === "url") {
				return trackId;
			}

			const plugin = bot.pluginManager.getPlugin(source);
			if (!plugin?.getTrackUrl) {
				bot.logger.error(
					bot.locale.t("messages.playerService.player.error.plugin_not_found", {
						source,
					}),
				);
				return null;
			}

			const url = await plugin.getTrackUrl(trackId);

			if (!url) {
				bot.logger.error(
					bot.locale.t("messages.playerService.errors.track_url_not_found", {
						trackId,
					}),
				);
				return null;
			}

			return url;
		} catch (error) {
			bot.logger.error(
				bot.locale.t("messages.playerService.player.error.get_track_url", {
					trackId,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			await this.playNextTrack()
			return null;
		}
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
		if (this.timers.fadeOut) {
			clearTimeout(this.timers.fadeOut);
			this.timers.fadeOut = null;
		}

		// Используем Promise.resolve для гарантии асинхронного выполнения
		this.timers.fadeOut = setTimeout(() => {
			Promise.resolve().then(() => {
				if (this.state.resource?.volume) {
					void this.smoothVolumeChange(
						this.state.volume / 100,
						3000,
						true,
						true,
					);
				}
			});
		}, 500);
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
			bot.logger.debug(
				bot.locale.t("messages.playerService.player.status.fadeout_cleared"),
			);
		}

		if (duration && duration > 0) {
			this.timers.fadeOut = setTimeout(() => {
				void this.smoothVolumeChange(0, 6000, false);
			}, duration);
			bot.logger.debug(
				bot.locale.t("messages.playerService.player.status.fadeout_set", {
					duration,
				}),
			);
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
				process.env.FFPROBE_PATH || undefined,
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
			await bot.queueService.setTrack(this.guildId, {
				...track,
				priority: true,
			});
		}
	}

	/**
	 * @en Loads the next track.
	 * @ru Загружает следующий трек.
	 */
	private async loadNextTrack(): Promise<void> {
		if (this.guildId) {
			this.state.nextTrack = await bot.queueService.getTrack(this.guildId);
		}
	}

	/**
	 * @en Plays the next track.
	 * @ru Проигрывает следующий трек.
	 */
	private async playNextTrack(): Promise<void> {
		if (this.state.loop && this.state.currentTrack) {
			await this.playTrack(this.state.currentTrack);
		} else if (this.state.nextTrack) {
			await this.playTrack(this.state.nextTrack);
			if (!this.state.loop) {
				this.state.nextTrack = null;
				await this.loadNextTrack();
			}
		} else if (this.state.wave && this.state.lastTrack?.trackId) {
			if (this.state.lastTrack.source === "yandex") {
				const recommendations = await this.getRecommendations(
					this.state.lastTrack.trackId,
				);
				if (recommendations.length > 0) {
					await this.playTrack(recommendations[0]);
					await bot.queueService.setLastTrackID(
						this.guildId,
						recommendations[0].trackId,
					);
					this.state.lastTrack = recommendations[0];
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

		return recommendations.map(
			(rec: { id: string; title: string; artists: any[] }) => ({
				source: "yandex",
				trackId: rec.id,
				info: `${rec.title} - ${rec.artists.map((a: { name: string }) => a.name).join(", ")}`,
				requestedBy: this.state.lastTrack?.requestedBy,
			}), 
		);
	}

	/**
	 * @en Sets up the disconnect handler.
	 * @ru Устанавливает обработчик отключения.
	 */
	private setupDisconnectHandler(): void {
		if (!this.state.connection) return;

		// Удаляем предыдущий обработчик, если он существует
		if (this.disconnectHandler) {
			this.state.connection.off(
				VoiceConnectionStatus.Disconnected,
				this.disconnectHandler,
			);
			this.disconnectHandler = null;
		}

		this.disconnectHandler = async () => {
			try {
				if (!this.state.connection) {
					bot.logger.error(
						bot.locale.t("messages.playerService.errors.connection_null"),
					);
					return;
				}

				// Пытаемся переподключиться
				await Promise.race([
					entersState(
						this.state.connection,
						VoiceConnectionStatus.Signalling,
						RECONNECTION_TIMEOUT,
					),
					entersState(
						this.state.connection,
						VoiceConnectionStatus.Connecting,
						RECONNECTION_TIMEOUT,
					),
				]);

				// Если успешно переподключились, восстанавливаем воспроизведение
				if (this.state.currentTrack && !this.state.isPlaying) {
					await this.playTrack(this.state.currentTrack);
				}
			} catch (error) {
				bot.logger.error(
					bot.locale.t(
						"messages.playerService.player.error.reconnection_failed",
						{
							error: error instanceof Error ? error.message : String(error),
						},
					),
				);
				this.handleDisconnect();
			}
		};

		this.state.connection.on(
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
						if (this.timers.emptyChannelTimeout) {
							clearTimeout(this.timers.emptyChannelTimeout);
							this.timers.emptyChannelTimeout = null;
						}
						this.leaveChannel();
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
				bot.locale.t("messages.playerService.errors.empty_check", {
					error: String(error),
				}),
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
			bot.logger.error(
				bot.locale.t("messages.playerService.errors.channel_id_null"),
			);
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
	 * @en Clears all timers.
	 * @ru Очищает все таймеры.
	 */
	private clearAllTimers(): void {
		for (const key in this.timers) {
			if (this.timers.hasOwnProperty(key)) {
				const timer = this.timers[key as keyof PlayerTimers];
				if (timer) {
					clearTimeout(timer);
					clearInterval(timer as NodeJS.Timeout);
					this.timers[key as keyof PlayerTimers] = null;
				}
			}
		}
	}

	/**
	 * @en Resets the player state.
	 * @ru Сбрасывает состояние плеера.
	 */
	private reset(): void {
		this.clearAllTimers();

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

			this.clearAllTimers();

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
				bot.locale.t("messages.playerService.player.error.destroy", {
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
		if (this.timers.emptyChannelTimeout) {
			clearTimeout(this.timers.emptyChannelTimeout);
			this.timers.emptyChannelTimeout = null;
		}
		this.timers.emptyChannelTimeout = setTimeout(callback, duration);
	}
}
