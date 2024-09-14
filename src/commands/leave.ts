import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";
import { VoiceService, CommandService, QueueService } from "../service/index.ts";

import { ILogObj, Logger } from "tslog";

const logger: Logger<ILogObj> = new Logger();
@Discord()
export class LeaveCommand {
    private readonly queueService = new QueueService()
    private readonly voiceService = new VoiceService(this.queueService);
    private readonly commandService = new CommandService();

    @Slash({ description: "leave", name: "leave" })
    async leave(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            await this.voiceService.leaveChannel();
            await this.commandService.sendReply(interaction, "Бот успешно покинул голосовой канал.");
        } catch (error) {
            logger.error("Ошибка при попытке отключиться от голосового канала:", error);
            await this.commandService.sendReply(interaction, "Не удалось покинуть голосовой канал, произошла ошибка.");
        }
    }

}