import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { CommandService, QueueService, YMApiService } from "../service/index.ts";

@Discord()
export class TestCommand {
    private readonly commandService = new CommandService();
    private readonly queueService = new QueueService();
    private waveEnabled = false;
    private readonly apiService: YMApiService = new YMApiService;

    @Slash({ description: "Тестовая комманда", name: "test" })
    async test(interaction: CommandInteraction): Promise<void> {

        const member = interaction.member as GuildMember;

        if (!member.voice.channel) {
            await this.commandService.sendReply(interaction, "Вы должны находиться в голосовом канале!");
            return;
        }

        const channelId = member.voice.channel.id;
        
        this.apiService.getSimilarTrack(channelId, this.queueService)
    }
}