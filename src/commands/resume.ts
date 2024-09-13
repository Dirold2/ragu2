import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";
import { VoiceService, CommandService, QueueService } from "../service/index.ts";

@Discord()
export class ResumeCommand {
    private readonly queueService = new QueueService()
    private readonly voiceService = new VoiceService(this.queueService);
    private readonly commandService = new CommandService();

    @Slash({ description: `resume`, name: `resume` })
    async resume(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        if (!this.voiceService.isPlaying()) {
            await this.commandService.sendReply(interaction, "Nothing is playing to resume");
            return;
        }

        this.voiceService.unpause();
        await this.commandService.sendReply(interaction, "Resumed");
    }
}