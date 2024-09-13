import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";
import { VoiceService, CommandService, QueueService } from "../service/index.ts";

@Discord()
export class JoinCommand {
    private readonly queueService = new QueueService()
    private readonly voiceService = new VoiceService(this.queueService);
    private readonly commandService = new CommandService();

    @Slash({ description: "Присоединиться к голосовому каналу", name: "join" })
    async join(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        if (this.voiceService.isConnected()) {
            await this.commandService.sendReply(interaction, "Я уже нахожусь в голосовом канале.");
            return;
        }

        try {
            await this.voiceService.joinChannel(interaction);
            await this.commandService.sendReply(interaction, "Успешно присоединился к голосовому каналу!");
        } catch {
            await this.commandService.sendReply(interaction, "Не удалось подключиться к голосовому каналу.");
        }
    }

}