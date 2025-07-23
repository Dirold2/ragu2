import {
	CommandInteraction,
	GuildMember,
	PermissionFlagsBits,
	VoiceChannel,
} from "discord.js";
import { Discord } from "discordx";
import {
	AudioPlayer,
	AudioPlayerStatus,
	createAudioPlayer,
	createAudioResource,
	DiscordGatewayAdapterCreator,
	entersState,
	getVoiceConnection,
	joinVoiceChannel,
	NoSubscriberBehavior,
	StreamType,
	VoiceConnection,
	VoiceConnectionStatus,
} from "@discordjs/voice";
import { EventEmitter } from "events";
import { AudioService } from "./audio/AudioService.js";
import { PlayerTimers } from "./PlayerTimers.js";
import { bot } from "../bot.js";
import type { Track, PlayerState } from "./index.js";
import { z } from "zod";
import { VOLUME } from "../config.js";
import { getAudioDurationInSeconds } from "get-audio-duration";
import { milli } from "miliseconds";

export enum PlayerServiceEvents {
	PLAYING = "playing",
	PAUSED = "paused",
	TRACK_STARTED = "trackStarted",
	TRACK_ENDED = "trackEnded",
	QUEUE_EMPTY = "queueEmpty",
	ERROR = "error",
	VOLUME_CHANGED = "volumeChanged",
	EQUALIZER_CHANGED = "equalizerChanged",
	LOWPASS_CHANGED = "lowPassChanged",
	LOOP_CHANGED = "loopChanged",
	CROSSFADE_COMPLETED = "crossfadeCompleted",
	CONNECTED = "connected",
	TRACK_QUEUED = "trackQueued",
}

export const TrackSchema = z.object({
	source: z.string().min(1),
	trackId: z.string().min(1),
	info: z.string().min(1),
	requestedBy: z.string().optional(),
	url: z.string().url().optional(),
});

/**
 * PlayerService управляет воспроизведением музыки, очередью, состоянием и взаимодействием с голосовым каналом Discord.
 * Использует AudioService для обработки аудио и взаимодействует с очередью через bot.queueService.
 */
@Discord()
export default class PlayerService extends EventEmitter {
	private readonly player: AudioPlayer = createAudioPlayer({
		behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
	});
	private audioService: AudioService;
	private timers: PlayerTimers = new PlayerTimers();
	private disconnectHandler: (() => Promise<void>) | null = null;
	public state: PlayerState = this.getInitialState();
	private fadeOutTimer: NodeJS.Timeout | null = null;
	private readonly FADEOUT_BEFORE_END = milli().seconds(3).value();
	private readonly CROSSFADE_DURATION = milli().seconds(3).value();

	constructor(
		private readonly commandService: any,
		public readonly guildId: string,
	) {
		super();
		this.audioService = new AudioService();
		this.setupEvents();
	}

	/**
	 * Настраивает обработку событий плеера и аудиосервиса
	 */
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
		this.player.on("error", (error) => {
			console.error("Player error:", error);
			this.handleTrackEnd();
		});
		this.audioService.on("volumeChanged", (volume) => {
			this.emit(PlayerServiceEvents.VOLUME_CHANGED, volume);
		});
		this.audioService.on("equalizerChanged", (eq) => {
			this.emit(PlayerServiceEvents.EQUALIZER_CHANGED, eq);
		});
		this.audioService.on("error", (error) => {
			this.emit(PlayerServiceEvents.ERROR, error);
		});
		this.audioService.on("lowPassChanged", (frequency) => {
			this.state.lowPassFrequency = frequency;
			this.emit(PlayerServiceEvents.LOWPASS_CHANGED, frequency);
		});
	}

	/**
	 * Получает URL трека динамически
	 */
	private async getTrackUrl(trackId: string, source: string): Promise<string | null> {
		try {
			if (source === "url") return trackId;
			const plugin = bot?.pluginManager?.getPlugin(source);
			if (!plugin?.getTrackUrl) {
				bot?.logger.error(bot.locale.t("messages.playerService.player.error.plugin_not_found", { source }));
				return null;
			}
			const url = await plugin.getTrackUrl(trackId);
			if (!url) {
				bot?.logger.warn(bot.locale.t("messages.playerService.player.warning.url_not_found", { trackId, source }));
				return null;
			}
			return url;
		} catch (error) {
			bot?.logger.error(bot.locale.t("messages.playerService.player.error.get_track_url", { trackId, error: error instanceof Error ? error.message : String(error) }));
			return null;
		}
	}

	/**
	 * Получает длительность трека (мс)
	 */
	private async getDuration(url: string): Promise<number> {
		try {
			const durationInSeconds = await getAudioDurationInSeconds(url, process.env.FFPROBE_PATH || undefined);
			return milli().milliseconds(durationInSeconds).value();
		} catch (error) {
			bot.logger.error(`Failed to get audio duration for ${url}: ${error}`);
			return 0;
		}
	}

	/**
	 * Воспроизводит трек
	 */
	async playTrack(track: Track): Promise<boolean> {
		if (!track) {
			console.error("Invalid track provided");
			return false;
		}
		try {
			const trackUrl = await this.getTrackUrl(track.trackId, track.source);
			if (!trackUrl) {
				console.error(`Failed to get URL for track: ${track.trackId}`);
				await this.playNextTrack();
				return false;
			}
			const processedStream = await this.audioService.createAudioStreamFromUrl(trackUrl);
			const resource = createAudioResource(processedStream, {
				inputType: StreamType.Raw,
				inlineVolume: false,
			});
			this.state.currentTrack = track;
			await this.setVolumeFast(0);
			this.player.play(resource);
			await this.setVolume(this.state.volume, 1000);
			try {
				const duration = await this.getDuration(trackUrl);
				if (duration && duration > this.FADEOUT_BEFORE_END) {
					if (this.fadeOutTimer) {
						clearTimeout(this.fadeOutTimer);
						this.fadeOutTimer = null;
					}
					this.fadeOutTimer = setTimeout(async () => {
						if (this.state.nextTrack) {
							await this.startCrossfade();
						} else {
							await this.setVolume(0, 1000);
						}
					}, duration - this.FADEOUT_BEFORE_END);
				}
			} catch (error) {
				console.error(`Failed to get track duration: ${error}`);
			}
			if (!this.state.loop) {
				await bot?.queueService.logTrackPlay(track.requestedBy!, track.trackId, track.info);
			}
			this.emit(PlayerServiceEvents.TRACK_STARTED, track);
			return true;
		} catch (error) {
			console.error(`Failed to play track: ${error}`);
			await this.playNextTrack();
			return false;
		}
	}

	/**
	 * Кроссфейд к следующему треку
	 */
	private async startCrossfade(): Promise<void> {
		try {
			if (!this.state.nextTrack) return;
			const nextTrack = this.state.nextTrack;
			this.state.nextTrack = null;
			const nextTrackUrl = await this.getTrackUrl(nextTrack.trackId, nextTrack.source);
			if (!nextTrackUrl) {
				console.error(`Failed to get URL for next track: ${nextTrack.trackId}`);
				await this.playNextTrack();
				return;
			}
			const currentStream = await this.audioService.createAudioStreamFromUrl(this.state.currentTrack!.url!);
			const nextStream = await this.audioService.createAudioStreamFromUrl(nextTrackUrl);
			const crossfadeStream = this.audioService.createCrossfadeStream(currentStream, nextStream, milli().seconds(this.CROSSFADE_DURATION).value());
			const resource = createAudioResource(crossfadeStream, {
				inputType: StreamType.Raw,
				inlineVolume: false,
			});
			this.state.currentTrack = nextTrack;
			this.player.play(resource);
			if (!this.state.loop) {
				await bot?.queueService.logTrackPlay(nextTrack.requestedBy!, nextTrack.trackId, nextTrack.info);
			}
			this.emit(PlayerServiceEvents.TRACK_STARTED, nextTrack);
			this.emit(PlayerServiceEvents.CROSSFADE_COMPLETED, nextTrack);
		} catch (error) {
			console.error(`Crossfade failed: ${error}`);
			await this.playNextTrack();
		}
	}

	/**
	 * Воспроизводит или добавляет трек в очередь
	 */
	async playOrQueueTrack(
		track: Track,
		interaction?: CommandInteraction,
	): Promise<void> {
		if (!track) {
			console.error("Invalid track provided");
			return;
		}
		try {
			// Если нет подключения и есть interaction, пробуем подключиться
			if (!this.state.connection && interaction) {
				await this.joinChannel(interaction);
			}
			if (this.state.isPlaying) {
				// Если что-то уже играет, добавляем в очередь
				await this.queueTrack(track);
				this.emit(PlayerServiceEvents.TRACK_QUEUED, track);
			} else {
				// Если ничего не играет, воспроизводим сразу
				const success = await this.playTrack(track);
				if (!success) {
					console.error("Failed to play track");
					return;
				}
			}
			// Загружаем следующий трек если его нет
			if (!this.state.nextTrack) {
				await this.loadNextTrack();
			}
		} catch (error) {
			console.error(`Failed to play or queue track: ${error}`);
			throw error;
		}
	}

	/**
	 * Добавляет трек в очередь
	 */
	private async queueTrack(track: Track): Promise<void> {
		if (this.guildId) {
			await bot?.queueService.setTrack(this.guildId, {
				...track,
				priority: true,
			});
		}
	}

	/**
	 * Загружает следующий трек из очереди
	 */
	private async loadNextTrack(): Promise<void> {
		if (this.guildId) {
			const nextTrack = await bot?.queueService.getTrack(this.guildId);
			if (nextTrack) {
				this.state.nextTrack = nextTrack;
			}
		}
	}

	/**
	 * Воспроизводит следующий трек
	 */
	private async playNextTrack(): Promise<void> {
		try {
			if (this.state.loop && this.state.currentTrack) {
				// Повторяем текущий трек
				await this.playTrack(this.state.currentTrack);
			} else if (this.state.nextTrack) {
				// Воспроизводим следующий трек
				const nextTrack = this.state.nextTrack;
				this.state.nextTrack = null;
				await this.playTrack(nextTrack);
				// Загружаем следующий трек если не в режиме повтора
				if (!this.state.loop) {
					await this.loadNextTrack();
				}
			} else {
				// Проверяем wave режим для рекомендаций
				if (this.state.currentTrack?.source === "yandex") {
					await this.tryPlayRecommendations();
				} else {
					// Очередь пуста
					this.emit(PlayerServiceEvents.QUEUE_EMPTY);
					this.resetState();
				}
			}
		} catch (error) {
			console.error(`Failed to play next track: ${error}`);
			this.resetState();
		}
	}

	/**
	 * Пытается воспроизвести рекомендации (wave режим)
	 */
	private async tryPlayRecommendations(): Promise<void> {
		try {
			const waveEnabled = bot?.queueService.getWave(this.guildId);
			const lastTrack = this.state.currentTrack;
			if (waveEnabled && lastTrack?.trackId && lastTrack.source === "yandex") {
				const recommendations = await this.getRecommendations(lastTrack.trackId);
				if (recommendations.length > 0) {
					await this.playTrack(recommendations[0]);
					bot?.queueService.setLastTrackID(this.guildId, recommendations[0].trackId);
					return;
				}
			}
			// Если рекомендации не найдены или wave отключен
			this.emit(PlayerServiceEvents.QUEUE_EMPTY);
			this.resetState();
		} catch (error) {
			console.error(`Failed to play recommendations: ${error}`);
			this.emit(PlayerServiceEvents.QUEUE_EMPTY);
			this.resetState();
		}
	}

	/**
	 * Получает рекомендации для трека
	 */
	private async getRecommendations(trackId: string): Promise<Track[]> {
		try {
			const plugin = bot?.pluginManager?.getPlugin("yandex");
			if (!plugin?.getRecommendations) {
				return [];
			}
			const recommendations = await plugin.getRecommendations(trackId);
			return recommendations.map(
				(rec: { id: string; title: string; artists: any[] }) => ({
					source: "yandex",
					trackId: rec.id,
					info: `${rec.title} - ${rec.artists.map((a: { name: string }) => a.name).join(", ")}`,
					requestedBy: this.state.currentTrack?.requestedBy,
				}),
			);
		} catch (error) {
			console.error(`Failed to get recommendations: ${error}`);
			return [];
		}
	}

	/**
	 * Инициализирует свойства плеера
	 */
	public async initialize(
		property: keyof Pick<PlayerState, "loop" | "volume">,
	): Promise<void> {
		try {
			const getters = {
				loop: () => bot?.queueService.getLoop(this.guildId),
				volume: () => bot?.queueService.getVolume(this.guildId),
			};
			let value: boolean | number | null = getters[property]();
			if (value === null && property === "volume") {
				value = VOLUME.DEFAULT_PERCENT;
			}
			if (property === "volume") {
				this.state[property] = value as number;
				bot?.queueService.setVolume(this.guildId, value as number);
				await this.setVolume(value as number);
				console.log(value);
			} else {
				this.state[property] = value as boolean;
				bot?.queueService.setLoop(this.guildId, value as boolean);
			}
		} catch (error) {
			console.error(`Failed to initialize ${property}: ${error}`);
		}
	}

	/**
	 * Получает текущий трек
	 */
	getCurrentTrack(): Track | null {
		return this.state.currentTrack;
	}

	/**
	 * Получает следующий трек
	 */
	getNextTrack(): Track | null {
		return this.state.nextTrack;
	}

	/**
	 * Проверяет, воспроизводится ли что-то
	 */
	isPlaying(): boolean {
		return this.state.isPlaying;
	}

	/**
	 * Проверяет, на паузе ли плеер
	 */
	isPaused(): boolean {
		return this.state.pause;
	}

	/**
	 * Получает текущую громкость
	 */
	getVolume(): number {
		return this.state.volume;
	}

	/**
	 * Устанавливает режим повтора
	 */
	async setLoop(enabled: boolean): Promise<void> {
		this.state.loop = enabled;
		bot?.queueService.setLoop(this.guildId, enabled);
		this.emit(PlayerServiceEvents.LOOP_CHANGED, enabled);
	}

	/**
	 * Получает состояние повтора
	 */
	getLoop(): boolean {
		return this.state.loop;
	}

	/**
	 * Устанавливает громкость
	 */
	async setVolume(volume: number, duration = 200): Promise<void> {
		await this.audioService.setVolume(volume / 100, duration);
		bot?.queueService.setVolume(this.guildId, volume);
		this.state.volume = volume;
	}

	async setVolumeFast(volume: number) {
		this.audioService.setVolumeFast(volume / 100);
	}

	/**
	 * Пропускает текущий трек
	 */
	public async skip(): Promise<void> {
		try {
			this.state.loop = false;
			bot?.queueService.setLoop(this.guildId, false);
			// Плавно уменьшаем громкость перед сменой трека
			await this.setVolume(0, 1000);
			await new Promise((r) => setTimeout(r, 1000));
			await this.playNextTrack();
		} catch (error) {
			console.error(`Failed to skip track: ${error}`);
			this.emit(PlayerServiceEvents.ERROR, error);
		}
	}

	/**
	 * Устанавливает эквалайзер
	 */
	async setBass(bass: number): Promise<void> {
		this.audioService.setBass(bass);
	}

	/**
	 * Включает/выключает компрессор
	 */
	async setCompressor(enabled: boolean): Promise<void> {
		this.audioService.setCompressor(enabled);
	}

	/**
	 * Кроссфейд к следующему треку
	 */
	async crossfadeToTrack(nextTrack: Track, duration = 3000): Promise<void> {
		if (!this.state.currentTrack) {
			await this.playTrack(nextTrack);
			return;
		}
		try {
			// Фейд-аут текущего трека
			await this.audioService.setVolume(0, duration / 2);
			// Через половину времени начинаем новый трек
			setTimeout(async () => {
				await this.playTrack(nextTrack);
				this.audioService.setVolume(0);
				await this.audioService.setVolume(this.state.volume / 100, duration / 2);
			}, duration / 2);
			this.emit(PlayerServiceEvents.CROSSFADE_COMPLETED, nextTrack);
		} catch (error) {
			console.error(`Crossfade failed: ${error}`);
			await this.playTrack(nextTrack);
		}
	}

	/**
	 * Подключается к голосовому каналу
	 */
	public async joinChannel(interaction: CommandInteraction): Promise<void> {
		const member = interaction.member as GuildMember;
		const voiceChannelId = member.voice.channel?.id;
		if (!voiceChannelId || !this.hasVoiceAccess(member)) {
			await this.commandService.reply(this.commandService.locale.t("messages.playerService.errors.not_in_voice_channel"));
			return;
		}
		try {
			this.state.channelId = voiceChannelId;
			this.state.connection = await this.establishConnection(voiceChannelId, interaction);
			// Инициализируем настройки
			await Promise.all([this.initialize("volume"), this.initialize("loop")]);
			this.setupDisconnectHandler();
			this.startEmptyCheck();
			this.emit(PlayerServiceEvents.CONNECTED, voiceChannelId);
		} catch (error) {
			console.error(`Voice connection failed: ${error}`);
			this.resetState();
		}
	}

	private async establishConnection(channelId: string, interaction: CommandInteraction): Promise<VoiceConnection> {
		let connection = getVoiceConnection(this.guildId);
		if (connection) return connection;
		if (!interaction.guild) {
			throw new Error("Guild not found");
		}
		connection = joinVoiceChannel({
			channelId,
			guildId: this.guildId,
			adapterCreator: interaction.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
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

	private hasVoiceAccess(member: GuildMember): boolean {
		const voiceChannel = member.voice.channel;
		return !!(voiceChannel?.permissionsFor(member)?.has(PermissionFlagsBits.Connect) && voiceChannel.id);
	}

	public async togglePause(): Promise<void> {
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
			console.error(`Failed to toggle pause: ${error}`);
		}
	}

	private setupDisconnectHandler(): void {
		if (!this.state.connection) return;
		if (this.disconnectHandler) {
			this.state.connection.off(VoiceConnectionStatus.Disconnected, this.disconnectHandler);
			this.disconnectHandler = null;
		}
		this.disconnectHandler = async () => {
			try {
				if (!this.state.connection) return;
				await Promise.race([
					entersState(this.state.connection, VoiceConnectionStatus.Signalling, 5000),
					entersState(this.state.connection, VoiceConnectionStatus.Connecting, 5000),
				]);
				if (this.state.currentTrack && !this.state.isPlaying) {
					await this.playTrack(this.state.currentTrack);
				}
			} catch (error) {
				console.error(`Reconnection failed: ${error}`);
				this.handleDisconnect();
			}
		};
		this.state.connection.on(VoiceConnectionStatus.Disconnected, this.disconnectHandler);
	}

	private handleDisconnect(): void {
		if (this.state.connection) {
			this.state.connection.removeAllListeners();
			this.state.connection.destroy();
			this.state.connection = null;
		}
		this.resetState();
	}

	public leaveChannel(): void {
		if (this.state.connection) {
			this.state.connection.destroy();
			this.clearTimers();
			this.resetState();
			this.state.channelId = null;
		}
	}

	private startEmptyCheck(): void {
		if (this.timers.emptyChannelInterval) {
			clearInterval(this.timers.emptyChannelInterval);
			this.timers.emptyChannelInterval = null;
		}
		this.timers.emptyChannelInterval = setInterval(() => void this.checkEmpty(), milli().seconds(30).value()); // Проверяем каждые 30 секунд
	}

	private async checkEmpty(): Promise<void> {
		if (!this.state.connection || !this.state.channelId) return;
		try {
			const channel = await this.getVoiceChannel();
			if (!channel) {
				this.handleDisconnect();
				return;
			}
			const membersCount = channel.members.filter(
				(m) => !m.user.bot && m.id !== bot?.client.user?.id,
			).size;
			if (membersCount === 0) {
				if (!this.timers.emptyChannelTimeout) {
					this.timers.emptyChannelTimeout = setTimeout(() => {
						this.leaveChannel();
					}, milli().seconds(30).value());
				}
			} else if (this.timers.emptyChannelTimeout) {
				clearTimeout(this.timers.emptyChannelTimeout);
				this.timers.emptyChannelTimeout = null;
			}
		} catch (error) {
			console.error(`Empty check failed: ${error}`);
			this.handleDisconnect();
		}
	}

	private async getVoiceChannel(): Promise<VoiceChannel | null> {
		if (!this.state.channelId) return null;
		try {
			const guild = await bot?.client.guilds.fetch(this.guildId);
			const channel = (await guild.channels.fetch(this.state.channelId)) as VoiceChannel;
			return channel;
		} catch (error) {
			console.error(`Failed to fetch voice channel: ${error}`);
			return null;
		}
	}

	private handleTrackEnd = async (): Promise<void> => {
		try {
			// Очищаем таймер fadeOut если он есть
			if (this.fadeOutTimer) {
				clearTimeout(this.fadeOutTimer);
				this.fadeOutTimer = null;
			}
			const previousTrack = this.state.currentTrack;
			// Сбрасываем состояние текущего трека
			this.state.currentTrack = null;
			this.state.isPlaying = false;
			this.state.pause = false;
			// Эмитим событие о завершении трека
			this.emit(PlayerServiceEvents.TRACK_ENDED, previousTrack);
			// Проверяем режим повтора
			if (this.state.loop && previousTrack) {
				// Если включен режим повтора, воспроизводим тот же трек
				await this.playTrack(previousTrack);
			} else {
				// Иначе переходим к следующему треку
				await this.playNextTrack();
			}
		} catch (error) {
			console.error(`Error handling track end: ${error}`);
			this.emit(PlayerServiceEvents.ERROR, error);
			this.resetState();
		}
	};

	private resetState(): void {
		this.state = {
			...this.state,
			isPlaying: false,
			currentTrack: null,
			nextTrack: null,
		};
	}

	public startInactiveCheck(): void {
		setInterval(() => {
			if (!this.state.isPlaying && this.state.channelId) {
				this.checkEmpty();
			}
		}, milli().minutes(5).value()); // 5 минут
	}

	public async destroy(): Promise<void> {
		try {
			// Очищаем таймер fadeOut если он есть
			if (this.fadeOutTimer) {
				clearTimeout(this.fadeOutTimer);
				this.fadeOutTimer = null;
			}
			this.player.stop();
			this.audioService.destroy();
			this.removeAllListeners();
			this.clearTimers();
			this.resetState();
		} catch (error) {
			console.error(`Destroy failed: ${error}`);
		}
	}

	/**
	 * Получает текущее состояние плеера
	 */
	public getState() {
		return {
			...this.state,
			playerStatus: this.player.state.status,
		};
	}

	/**
	 * Устанавливает следующий трек для воспроизведения
	 */
	public setNextTrack(track: Track): void {
		this.state.nextTrack = track;
	}

	/**
	 * Устанавливает параметры low pass фильтра
	 */
	async setLowPassFilter(frequency: number, q: number = 0.707): Promise<void> {
		this.audioService.setLowPassFrequency(frequency);
		this.state.lowPassFrequency = frequency;
		this.state.lowPassQ = q;
	}

	private clearTimers(): void {
		Object.values(this.timers).forEach((timer) => {
			if (timer) {
				clearTimeout(timer);
				clearInterval(timer as NodeJS.Timeout);
			}
		});
		this.timers = new PlayerTimers();
	}

	private getInitialState(): PlayerState {
		return {
			connection: null,
			isPlaying: false,
			channelId: null,
			volume: VOLUME.DEFAULT_PERCENT,
			currentTrack: null,
			nextTrack: null,
			loop: false,
			pause: false,
			wave: false,
			lowPassFrequency: 0,
			lowPassQ: 0.707,
		};
	}
}
