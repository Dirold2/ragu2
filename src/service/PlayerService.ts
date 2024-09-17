import { Discord } from "discordx";
import { QueueService, Track, CommandService } from "./index.js";
import { AudioPlayer, AudioPlayerStatus, 
    createAudioPlayer, createAudioResource, 
    DiscordGatewayAdapterCreator, entersState, 
    getVoiceConnection, 
    joinVoiceChannel, StreamType, 
    VoiceConnection, VoiceConnectionStatus 
} from "@discordjs/voice";
import { Logger } from "winston";
import logger from "../utils/logger.js";
import { CommandInteraction, GuildMember, PermissionFlagsBits } from "discord.js";

const DEFAULT_VOLUME = 0.05;
const RECONNECTION_TIMEOUT = 5000;

@Discord()
class PlayerService {
    private player: AudioPlayer = createAudioPlayer();
    private connection: VoiceConnection | null = null;
    private readonly queueService = new QueueService();
    private readonly logger: Logger = logger;
    private readonly commandService = new CommandService();

    constructor() {
        this.setupPlayerEvents();
        this.logger = logger;
        this.commandService = new CommandService();
        this.queueService = new QueueService();
    }

    // Основной метод воспроизведения треков
    public async playOrQueueTrack(channelId: string, track: Track): Promise<void> {
        if (this.player.state.status === AudioPlayerStatus.Playing) {
            await this.queueService.setTrack(channelId, track);
            this.logger.verbose(`Track added to queue: ${track.info}`);
        } else {
            await this.play(track);
        }
    }

    // Универсальный метод для начала воспроизведения трека
    private async play(track: Track): Promise<void> {
        try {
            const resource = createAudioResource(track.url, { inputType: StreamType.Opus, inlineVolume: true });
            resource.volume?.setVolume(DEFAULT_VOLUME);
            this.player.play(resource);
            this.logger.info(`Playing track: ${track.info}`);
        } catch (error) {
            this.logger.error(`Playback error: ${error instanceof Error ? error.message : String(error)}`);
            this.player.stop(true);
        }
    }

    // Подключение к голосовому каналу
    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        try {
            const member = interaction.member as GuildMember;
            if (!this.hasVoiceChannelAccess(member)) {
                await this.commandService.send(interaction, "Нет доступа к голосовому каналу.");
                return;
            }

            const voiceChannelId = member.voice.channel?.id;
            const guildId = interaction.guild?.id;
            if (!guildId || !voiceChannelId) {
                throw new Error("ID гильдии или ID голосового канала не найдены.");
            }

            await this.connectToChannel(guildId, voiceChannelId, interaction);
            await this.commandService.send(interaction, "Успешно подключился к голосовому каналу.");
        } catch (error) {
            this.logger.error("Ошибка подключения к каналу:", error);
            await this.commandService.send(interaction, "Не удалось подключиться к голосовому каналу.");
        }
    }

    // Метод для остановки воспроизведения
    public stop(): void {
        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.player.stop(true);
            this.logger.debug("Player stopped.");
        } else {
            this.logger.debug("Player is already stopped.");
        }
    }

    // Метод для паузы/возобновления воспроизведения
    public async togglePause(interaction: CommandInteraction): Promise<void> {
        const guildId = interaction.guild?.id;
        if (!guildId) {
            await this.commandService.send(interaction, "Команда должна быть выполнена на сервере.");
            return;
        }

        this.connection = getVoiceConnection(guildId) ?? null;
        if (!this.connection) {
            await this.commandService.send(interaction, "Бот не подключен к голосовому каналу.");
            return;
        }

        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.player.pause();
            this.logger.debug("Воспроизведение приостановлено.");
            await this.commandService.send(interaction, "Воспроизведение приостановлено.");
        } else if (this.player.state.status === AudioPlayerStatus.Paused) {
            this.player.unpause();
            this.logger.debug("Воспроизведение возобновлено.");
            await this.commandService.send(interaction, "Воспроизведение возобновлено.");
        } else {
            this.logger.debug("Плеер не воспроизводит и не приостановлен.");
            await this.commandService.send(interaction, "Нет активного воспроизведения для паузы или возобновления.");
        }
    }

    // Отключение от голосового канала
    public async leaveChannel(): Promise<void> {
        this.connection?.destroy();
        this.connection = null;
        this.logger.info("Disconnected from voice channel.");
    }

    // New method to handle pause command
    public async handlePauseCommand(interaction: CommandInteraction): Promise<void> {
        await this.togglePause(interaction);
    }

    // Modified setupPlayerEvents method
    private setupPlayerEvents(): void {
        this.player.on(AudioPlayerStatus.Idle, async () => {
            await this.handleTrackEnd();
        });

        this.player.on('error', error => {
            this.logger.error(`Error in audio player: ${error.message}`);
        });

        this.player.on(AudioPlayerStatus.Playing, () => {
            this.logger.debug('Audio player is now playing.');
        });

        this.player.on(AudioPlayerStatus.Paused, () => {
            this.logger.debug('Audio player is now paused.');
        });
    }

    // Обработка завершения воспроизведения трека
    private async handleTrackEnd(): Promise<void> {
        const channelId = this.connection?.joinConfig.channelId;
        if (!channelId) return;

        const track = await this.queueService.getTrack(channelId);
        if (track) {
            await this.play(track);
        } else {
            this.logger.info("Queue is empty, playback stopped.");
            // Можно оставить, если нужно отключение после завершения очереди
            // await this.leaveChannel();
        }
    }

    // Проверка доступа к голосовому каналу
    private hasVoiceChannelAccess(member: GuildMember): boolean {
        const voiceChannel = member.voice.channel;
        return !!voiceChannel && voiceChannel.permissionsFor(member)?.has(PermissionFlagsBits.Connect);
    }

    // Подключение к каналу и воспроизведение трека из очереди
    private async connectToChannel(guildId: string, channelId: string, interaction: CommandInteraction): Promise<void> {
        this.connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: interaction.guild?.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            selfDeaf: false,
        });

        try {
            await entersState(this.connection, VoiceConnectionStatus.Ready, 30000);
            this.connection.subscribe(this.player);
            this.logger.info("Успешно подключился к голосовому каналу.");
        
            const track = await this.queueService.getTrack(channelId);
            if (track) {
                await this.playOrQueueTrack(channelId, track);
            }
            this.handleDisconnection();
        } catch (error) {
            this.logger.error("Не удалось подключиться к голосовому каналу в течение таймаута.", error);
            await this.leaveChannel();
            throw new Error("Время подключения истекло.");
        }
    }

    // Обработка отключения и попытка переподключения
    private handleDisconnection(): void {
        this.connection?.on(VoiceConnectionStatus.Disconnected, this.reconnect.bind(this));
    }

    // Логика переподключения при разрыве соединения
    private async reconnect(): Promise<void> {
        if (!this.connection) return;

        try {
            await Promise.race([
                entersState(this.connection, VoiceConnectionStatus.Signalling, RECONNECTION_TIMEOUT),
                entersState(this.connection, VoiceConnectionStatus.Connecting, RECONNECTION_TIMEOUT),
            ]);
            this.logger.info("Connection restored.");
        } catch (error) {
            this.logger.error(`Error reconnecting: ${error instanceof Error ? error.message : String(error)}`);
            this.connection.destroy();
            this.connection = null;
            this.logger.info("Connection terminated.");
        }
    }
}

export { PlayerService }