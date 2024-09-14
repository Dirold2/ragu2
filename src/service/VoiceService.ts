import {
    joinVoiceChannel,
    createAudioResource,
    createAudioPlayer,
    VoiceConnection,
    AudioPlayer,
    entersState,
    VoiceConnectionStatus,
    DiscordGatewayAdapterCreator,
    AudioPlayerStatus,
} from "@discordjs/voice";

import { CommandInteraction, GuildMember, PermissionFlagsBits } from "discord.js";
import { QueueService, CommandService } from "../service/index.ts";
import { Track } from "./QueueService.ts";
import { YMApiService } from "./YMApiService.ts";
import { ILogObj, Logger } from "tslog";

export class VoiceService {
    private player: AudioPlayer = createAudioPlayer();
    private connection: VoiceConnection | null = null;
    private readonly commandService = new CommandService();
    private readonly apiService: YMApiService;
    private logger: Logger<ILogObj> = new Logger();

    constructor(private queueService: QueueService) {
        this.apiService = new YMApiService();
        this.setupPlayerEvents();
    }

    private setupPlayerEvents(): void {
        this.player.on("stateChange", async (oldState, newState) => {
            if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
                await this.handleTrackEnd();
            }
        });
    }

    private async handleTrackEnd(): Promise<void> {
        const channelId = this.connection?.joinConfig.channelId || '';

        const nextTrack = await this.queueService.getNextTrack(channelId);
        if (nextTrack) {
            await this.playNextTrack(nextTrack);
        } else if (await this.queueService.getWaveStatus(channelId)) {
            const similarTrack = await this.apiService.getSimilarTrack(channelId, this.queueService);
            await this.playNextTrack(similarTrack);
            await this.queueService.setLastTrackID(channelId, Number(similarTrack.id));
        } else {
            this.logger.info("Очередь пуста, воспроизведение остановлено.");
        }
    }

    private hasVoiceChannelAccess(member: GuildMember): boolean {
        const voiceChannel = member.voice.channel;
        return !!voiceChannel && voiceChannel.permissionsFor(member).has(PermissionFlagsBits.Connect);
    }

    public isChannel(interaction: CommandInteraction): boolean {
        const member = interaction.member as GuildMember;
        return !!this.connection && !!member.voice.channel;
    }

    public isConnected(): boolean {
        return !!this.connection;
    }

    public isPlaying(): boolean {
        return this.player.state.status === AudioPlayerStatus.Playing;
    }

    public isPaused(): boolean {
        return this.player.state.status === AudioPlayerStatus.Paused;
    }

    public stopPlayer(): void {
        if (this.isPlaying()) {
            this.player.stop(true);
            this.logger.info("Плеер остановлен.");
        } else {
            this.logger.info("Плеер уже остановлен.");
        }
    }

    public pause(): void {
        if (this.isPlaying()) {
            this.player.pause();
            this.logger.info("Проигрывание приостановлено.");
        } else {
            this.logger.info("Нечего приостановить, плеер не воспроизводит трек.");
        }
    }

    public unpause(): void {
        if (this.isPaused()) {
            this.player.unpause();
            this.logger.info("Проигрывание возобновлено.");
        } else {
            this.logger.info("Плеер не находится в состоянии паузы.");
        }
    }

    private async playNextTrack(track: Track): Promise<void> {
        try {
            const resource = createAudioResource(track.url, { inlineVolume: true });
            resource.volume?.setVolume(0.03);
            this.player.play(resource);
            this.logger.info(`Воспроизведение трека: ${track.info}`);
        } catch (error) {
            this.logger.error(`Ошибка воспроизведения: ${(error as Error).message}`);
            this.player.stop(true);
        }
    }

    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        try {
            const member = interaction.member as GuildMember;

            if (!this.hasVoiceChannelAccess(member)) {
                await this.commandService.sendReply(interaction, "Нет доступа к голосовому каналу.");
                return;
            }

            const voiceChannelId = member.voice.channel!.id;
            const guildId = interaction.guild?.id;

            if (!guildId) throw new Error("Guild ID не найден.");

            await this.connectToChannel(guildId, voiceChannelId, interaction);
        } catch (error) {
            this.logger.error("Ошибка подключения к каналу:", error);
            await this.commandService.sendReply(interaction, "Не удалось подключиться к голосовому каналу.");
        }
    }

    private async connectToChannel(guildId: string, channelId: string, interaction: CommandInteraction): Promise<void> {
        if (this.connection && this.connection.joinConfig.channelId === channelId) {
            this.logger.info("Уже подключено к каналу. Добавление трека...");
        } else {
            this.connection = joinVoiceChannel({
                channelId,
                guildId,
                adapterCreator: interaction.guild!.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            });

            await entersState(this.connection, VoiceConnectionStatus.Ready, 30000);
            this.connection.subscribe(this.player);

            this.logger.info("Успешно подключено к каналу.");
        }

        const nextTrack = await this.queueService.getNextTrack(channelId);
        if (nextTrack) {
            await this.addTrack(channelId, nextTrack);
        } else {
            this.logger.info("Очередь пуста.");
        }

        this.handleDisconnection();
    }

    public async leaveChannel(): Promise<void> {
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
            this.logger.info("Отключено от голосового канала.");
        }
    }

    public async clearQueue(channelId: string): Promise<void> {
        await this.queueService.clearQueue(channelId);
        this.player.stop(true);
        this.logger.info("Очередь очищена и плеер остановлен.");
    }

    private handleDisconnection(): void {
        if (this.connection) {
            this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(this.connection!, VoiceConnectionStatus.Signalling, 5000),
                        entersState(this.connection!, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                    this.logger.info("Соединение восстановлено.");
                } catch (error) {
                    this.logger.error("Error reconnecting:", (error as Error).message);
                    this.connection!.destroy();
                    this.connection = null;
                    this.logger.info("Соединение разорвано.");
                }
            });
        }
    }

    public async addTrack(channelId: string, track: Track): Promise<void> {
        if (this.isPlaying()) {
            await this.queueService.addTrack(channelId, track);
            this.logger.info(`Трек добавлен в очередь: ${track.info}`);
        } else {
            await this.playNextTrack(track);
        }
    }
}