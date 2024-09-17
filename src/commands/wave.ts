import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { CommandService, QueueService } from "../service/index.js";

@Discord()
export class WaveCommand {
    private readonly commandService = new CommandService();
    private readonly queueService = new QueueService();
    private waveEnabled = false;

    @Slash({ description: "Моя волна", name: "wave" })
    async toggleWave(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        const member = interaction.member as GuildMember;
        const voiceChannelId = member.voice.channel!.id;

        this.waveEnabled = !this.waveEnabled;
        const waveStatus = this.waveEnabled ? "Моя волна включена" : "Моя волна выключена";

        await this.commandService.send(interaction, `${waveStatus}.`);

        // Сохранение текущего статуса волны в базу данных
        await this.queueService.setWaveStatus(voiceChannelId, this.waveEnabled);
    }
}