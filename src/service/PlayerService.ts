import { Discord } from "discordx";
import { QueueService, Track, CommandService } from "./index.js";
import { AudioPlayer, AudioPlayerStatus, 
    createAudioPlayer, createAudioResource, 
    DiscordGatewayAdapterCreator, entersState, 
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
                await this.commandService.send(interaction, "No access to voice channel.");
                return;
            }

            const voiceChannelId = member.voice.channel?.id;
            const guildId = interaction.guild?.id;
            if (!guildId || !voiceChannelId) {
                throw new Error("Guild ID or Voice Channel ID not found.");
            }

            await this.connectToChannel(guildId, voiceChannelId, interaction);
        } catch (error) {
            this.logger.error("Error connecting to channel:", error);
            await this.commandService.send(interaction, "Failed to connect to voice channel.");
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
    public togglePause(): void {
        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.player.pause();
            this.logger.debug("Playback paused.");
        } else if (this.player.state.status === AudioPlayerStatus.Paused) {
            this.player.unpause();
            this.logger.debug("Playback resumed.");
        } else {
            this.logger.debug("Player is not playing or paused.");
        }
    }

    // Отключение от голосового канала
    public async leaveChannel(): Promise<void> {
        this.connection?.destroy();
        this.connection = null;
        this.logger.info("Disconnected from voice channel.");
    }

    // Настройка событий аудиоплеера
    private setupPlayerEvents(): void {
        this.player.on(AudioPlayerStatus.Idle, async () => {
            await this.handleTrackEnd();
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
            this.logger.info("Successfully connected to voice channel.");

            const track = await this.queueService.getTrack(channelId);
            if (track) {
                await this.playOrQueueTrack(channelId, track);
            }
            this.handleDisconnection();
        } catch {
            this.logger.error("Failed to connect to voice channel within the timeout.");
            await this.leaveChannel();
            throw new Error("Connection timed out.");
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