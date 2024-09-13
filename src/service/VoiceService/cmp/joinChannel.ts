import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, DiscordGatewayAdapterCreator, entersState, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { CommandInteraction, GuildMember, PermissionFlagsBits } from "discord.js";
import { playNextTrack } from "./playNextTrack.ts";
import { QueueService, CommandService } from "../../index.ts";

export class joinChannel {
    private player: AudioPlayer = createAudioPlayer();
    private connection: VoiceConnection | null = null;
    private readonly commandService = new CommandService();
    private readonly playNextTrack = new playNextTrack();
    private queueService = new QueueService();

    constructor() {
        // Добавляем обработчик события изменения состояния плеера
        this.player.on("stateChange", async (oldState, newState) => {
            if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
                // Когда плеер становится "idle" после проигрывания трека, запускаем следующий трек
                const nextTrack = await this.queueService.getNextTrack();
                if (nextTrack) {
                    await this.playNextTrack.playNextTrack(nextTrack);
                } else {
                    console.log("Очередь пуста, остановка проигрывания.");
                }
            }
        });
    }

    async joinChannel(interaction: CommandInteraction): Promise<void> {
        try {
            const member = interaction.member as GuildMember;
            const voiceChannel = member.voice.channel;
            const nextTrack = await this.queueService.getNextTrack();
            
            if (!voiceChannel || !voiceChannel.permissionsFor(member).has(PermissionFlagsBits.Connect)) {
                throw new Error("Нет доступа к каналу");
            }

            this.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild?.id as string,
                adapterCreator: interaction.guild!.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            });

            await entersState(this.connection, VoiceConnectionStatus.Ready, 30000);
            this.connection.subscribe(this.player);

            if (nextTrack) {
                if (this.player.state.status === AudioPlayerStatus.Idle) {
                    await this.playNextTrack.playNextTrack(nextTrack);
                } else {
                    await this.commandService.sendReply(interaction, "Трек уже воспроизводится, следующий будет после завершения текущего.");
                }
            } else {
                console.log("No next track available");
            }

        } catch (error) {
            console.error("Error joining channel:", error);
            await this.commandService.sendReply(interaction, "Не удалось подключиться к голосовому каналу.");
        }
    }

}