import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { QueueService, CommandService } from "../service/index.js";

@Discord()
export class ResumeCommand {
    private readonly queueService = new QueueService();
    private readonly commandService = new CommandService();

    @Slash({ description: "Очистить очередь", name: "queuedel" })
    async queuedel(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member as GuildMember;

        if (!member.voice.channel) {
            await this.commandService.send(interaction, "Вы должны находиться в голосовом канале!");
            return;
        }

        const channelId = member.voice.channel.id;

        await this.queueService.clearTracksQueue(channelId)
        await this.commandService.send(interaction, 'Очередь успешно очищена');
    }
}