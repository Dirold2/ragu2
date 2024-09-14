import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { QueueService, VoiceService, CommandService } from "../service/index.js";

@Discord()
export class SkipCommand {
    private readonly queueService = new QueueService()
    private readonly voiceService = new VoiceService(this.queueService);
    private readonly commandService = new CommandService();

    @Slash({ description: "skip", name: "skip" })
    async skip(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member as GuildMember;
        const channelId = member.voice.channelId;

        const tracksCount = await this.queueService.countMusicTracks(channelId ?? '');

        if (!tracksCount) {
            await this.commandService.sendReply(interaction, "Нет воспроизводимого трека.");
            return;
        }

        const nextTrack = await this.queueService.getNextTrack(channelId ?? '');

        if (nextTrack) {
            await this.voiceService.handleTrackEnd();
            await this.commandService.sendReply(interaction, "Пропустил трек.");
        } else {
            await this.commandService.sendReply(interaction, "Следующий трек закончен.");
        }
    }
}