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

export class VoiceService {
    private player: AudioPlayer = createAudioPlayer();
    private connection: VoiceConnection | null = null;
    private readonly commandService = new CommandService();
    private readonly apiService: YMApiService;

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
            console.log("Очередь пуста, воспроизведение остановлено.");
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
            console.log("Плеер остановлен.");
        } else {
            console.log("Плеер уже остановлен.");
        }
    }

    public pause(): void {
        if (this.isPlaying()) {
            this.player.pause();
            console.log("Проигрывание приостановлено.");
        } else {
            console.log("Нечего приостановить, плеер не воспроизводит трек.");
        }
    }

    public unpause(): void {
        if (this.isPaused()) {
            this.player.unpause();
            console.log("Проигрывание возобновлено.");
        } else {
            console.log("Плеер не находится в состоянии паузы.");
        }
    }

    private async playNextTrack(track: Track): Promise<void> {
        try {
            const resource = createAudioResource(track.url, { inlineVolume: true });
            resource.volume?.setVolume(0.03);
            this.player.play(resource);
            console.log(`Воспроизведение трека: ${track.info}`);
        } catch (error) {
            console.error(`Ошибка воспроизведения: ${(error as Error).message}`);
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
            console.error("Ошибка подключения к каналу:", error);
            await this.commandService.sendReply(interaction, "Не удалось подключиться к голосовому каналу.");
        }
    }

    private async connectToChannel(guildId: string, channelId: string, interaction: CommandInteraction): Promise<void> {
        if (this.connection && this.connection.joinConfig.channelId === channelId) {
            console.log("Уже подключено к каналу. Добавление трека...");
        } else {
            this.connection = joinVoiceChannel({
                channelId,
                guildId,
                adapterCreator: interaction.guild!.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            });

            await entersState(this.connection, VoiceConnectionStatus.Ready, 30000);
            this.connection.subscribe(this.player);

            console.log("Успешно подключено к каналу.");
        }

        const nextTrack = await this.queueService.getNextTrack(channelId);
        if (nextTrack) {
            await this.addTrack(channelId, nextTrack);
        } else {
            console.log("Очередь пуста.");
        }

        this.handleDisconnection();
    }

    public async leaveChannel(): Promise<void> {
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
            console.log("Отключено от голосового канала.");
        }
    }

    public async clearQueue(channelId: string): Promise<void> {
        await this.queueService.clearQueue(channelId);
        this.player.stop(true);
        console.log("Очередь очищена и плеер остановлен.");
    }

    private handleDisconnection(): void {
        if (this.connection) {
            this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(this.connection!, VoiceConnectionStatus.Signalling, 5000),
                        entersState(this.connection!, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                    console.log("Соединение восстановлено.");
                } catch (error) {
                    console.error("Error reconnecting:", (error as Error).message);
                    this.connection!.destroy();
                    this.connection = null;
                    console.log("Соединение разорвано.");
                }
            });
        }
    }

    public async addTrack(channelId: string, track: Track): Promise<void> {
        if (this.isPlaying()) {
            await this.queueService.addTrack(channelId, track);
            console.log(`Трек добавлен в очередь: ${track.info}`);
        } else {
            await this.playNextTrack(track);
        }
    }
}
