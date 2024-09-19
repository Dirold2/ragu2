import { Discord } from "discordx";
import { QueueService, CommandService } from "./index.js";
import { 
    AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, 
    DiscordGatewayAdapterCreator, entersState, getVoiceConnection, 
    joinVoiceChannel, StreamType, VoiceConnection, VoiceConnectionStatus 
} from "@discordjs/voice";
import logger from "../utils/logger.js";
import { CommandInteraction, GuildMember, PermissionFlagsBits } from "discord.js";

interface Track {
    url: string;
    info: string;
    source: string;
    trackId: string;
    addedAt?: bigint;
    waveStatus?: boolean;
}

const RECONNECTION_TIMEOUT = 5000;

@Discord()
class PlayerService {
    private player: AudioPlayer | null = null;
    private queueService: QueueService;
    private commandService: CommandService;
    public connection: VoiceConnection | null = null;
    public guildId: string = "";
    public channelId: string | null = null;
    public volume = 30;

    constructor() {
        this.queueService = new QueueService();
        this.commandService = new CommandService();
        this.initPlayer();
    }

    // ===================== Управление воспроизведением ===================== //

    // Воспроизведение или добавление трека в очередь
    public async playOrQueueTrack(track: Track): Promise<void> {
        if (this.player!.state.status !== AudioPlayerStatus.Playing) {
            this.play(track);
        } else {
            await this.queueService.setTrack(this.channelId, this.guildId, track);
            logger.verbose(`Track added to queue: ${track.info}`);
        }
    }

    // Воспроизведение трека
    private play(track: Track): void {
        const resource = createAudioResource(track.url, { 
            inputType: StreamType.Opus, 
            inlineVolume: true 
        });
        resource.volume?.setVolumeLogarithmic(this.volume / 100);
        this.player!.play(resource);
        logger.info(`Playing track: ${track.info}`);
    }

    // Пропустить трек
    public async skip(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        this.player?.stop();
        const nextTrack = await this.queueService.getTrack(this.channelId);
        
        if (nextTrack) {
            await this.playOrQueueTrack(nextTrack);
            await this.commandService.send(interaction, `Skipped to next track: ${nextTrack.info}`);
        } else {
            await this.commandService.send(interaction, "No more tracks in the queue.");
        }
    }

    // Пауза или возобновление воспроизведения
    public async togglePause(interaction: CommandInteraction): Promise<void> {
        // if (!this.ensureConnected(interaction)) return;

        if (this.player!.state.status === AudioPlayerStatus.Playing) {
            this.player!.pause();
            await this.commandService.send(interaction, "Playback paused.");
        } else {
            this.player!.unpause();
            await this.commandService.send(interaction, "Playback resumed.");
        }
    }

    // ===================== Управление громкостью ===================== //

    public setVolume(volume: number): void {
        this.volume = volume;
        if (this.player && this.player.state.status === AudioPlayerStatus.Playing) {
            this.player.state.resource.volume?.setVolume(this.volume / 100);
        }
    }

    // ===================== Управление подключением ===================== //

    // Присоединиться к голосовому каналу
    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        const member = interaction.member as GuildMember;
        const voiceChannelId = member.voice.channel?.id;
        const guildId = interaction.guild?.id;

        if (!this.hasVoiceChannelAccess(member) || !guildId || !voiceChannelId) {
            await this.commandService.send(interaction, "No access to voice channel or invalid guild/channel ID.");
            return;
        }

        this.channelId = voiceChannelId;
        this.guildId = String(guildId);

        this.connection = getVoiceConnection(guildId) || await this.connectToChannel(guildId, voiceChannelId, interaction);
        const track = await this.queueService.getTrack(voiceChannelId);
        if (track) await this.playOrQueueTrack(track);

        this.handleDisconnection();
    }

    // Отключиться от канала
    public leaveChannel(): void {
        this.connection?.destroy();
        logger.info("Disconnected from voice channel.");
    }

    // Подключение к голосовому каналу
    private async connectToChannel(guildId: string, channelId: string, interaction: CommandInteraction): Promise<VoiceConnection | null> {
        const connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: interaction.guild?.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            selfDeaf: false,
        });
    
        try {
            // Ожидаем, пока соединение перейдет в статус "Ready"
            await entersState(connection, VoiceConnectionStatus.Ready, 60000);
    
            // Проверяем, что соединение действительно установлено
            if (connection) {
                connection.subscribe(this.player ?? new AudioPlayer());
                logger.info("Successfully connected to voice channel.");
            } else {
                throw new Error("Connection is null.");
            }
    
            const track = await this.queueService.getTrack(channelId);
            if (track) await this.playOrQueueTrack(track);
    
            return connection;
        } catch (error) {
            // Если соединение есть, разрываем его
            if (connection) {
                connection.destroy();
            }
            logger.error("Failed to connect to voice channel.", error);
            throw new Error("Connection timeout.");
        }
    }
    

    // ===================== Вспомогательные методы ===================== //

    // Проверка подключения и вывод сообщения
    private async ensureConnected(interaction: CommandInteraction): Promise<boolean> {
        const connection = getVoiceConnection(this.guildId);

        if (!connection) {
            await this.commandService.send(interaction, "Bot is not connected to a voice channel.");
            return false;
        }
        return true;
    }

    // Проверка доступа к голосовому каналу
    private hasVoiceChannelAccess(member: GuildMember): boolean {
        return member.voice.channel?.permissionsFor(member)?.has(PermissionFlagsBits.Connect) ?? false;
    }

    // ===================== Управление состояниями подключения ===================== //

    // Обработка отключений и восстановления
    private handleDisconnection(): void {
        this.connection?.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection!, VoiceConnectionStatus.Signalling, RECONNECTION_TIMEOUT),
                    entersState(this.connection!, VoiceConnectionStatus.Connecting, RECONNECTION_TIMEOUT),
                ]);
                logger.info("Connection restored.");
            } catch (error) {
                logger.error(`Error reconnecting: ${error.message}`);
                this.connection?.destroy();
                logger.info("Connection terminated.");
            }
        });
    }

    // ===================== События плеера ===================== //

    // Инициализация плеера и событий
    private initPlayer(): void {
        if (this.player) return;

        this.player = createAudioPlayer();
        this.player.on('error', error => logger.error(`Error in audio player: ${error.message}`));
        this.player.on(AudioPlayerStatus.Idle, this.handleTrackEnd.bind(this));
    }

    // Обработка завершения трека
    private async handleTrackEnd(): Promise<void> {
        const track = await this.queueService.getTrack(this.channelId);
        if (track) {
            this.play(track);
        } else {
            logger.info("Queue is empty, playback stopped.");
        }
    }
}

export { PlayerService };