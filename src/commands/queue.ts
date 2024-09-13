import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { QueueService, CommandService } from "../service/index.ts";

@Discord()
export class QueueCommand {
    private readonly queueService = new QueueService();
    private readonly commandService = new CommandService();

    @Slash({ description: "Просмотр очереди", name: "queue" })
    async queue(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            const member = interaction.member as GuildMember;
            const channelId = member.voice.channel?.id;
            if (!channelId) {
                await this.commandService.sendReply(interaction, "Не удалось определить ID канала.");
                return
            }

            const queue = await this.queueService.getQueue(channelId);
            if (!queue[0].length) {
                await this.commandService.sendReply(interaction, "Очередь пуста.");
                return 
            }

            const queueString = queue[0]
                .map((track, index) => `${index + 1}. ${track.tracks.info}`)
                .join("\n");
            await this.commandService.sendReply(interaction, `Текущая очередь:\n${queueString}`);
        } catch (error) {
            const errorMsg = error instanceof Error
                ? `Произошла ошибка при получении очереди: ${error.name}: ${error.message}`
                : "Произошла неожиданная ошибка при получении очереди.";

            await this.commandService.sendReply(interaction, errorMsg);
        }
    }
}