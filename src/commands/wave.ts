import { CommandInteraction, GuildMember } from 'discord.js';
import { Discord, Slash } from 'discordx';

import { bot } from '../bot.js';

@Discord()
export class WaveCommand {
    private waveEnabled = false;

    @Slash({ description: "Моя волна", name: "wave" })
    async toggleWave(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        const member = interaction.member as GuildMember;
        const voiceChannelId = member.voice.channel!.id;

        this.waveEnabled = !this.waveEnabled;
        const waveStatus = this.waveEnabled ? "Моя волна включена" : "Моя волна выключена";

        await bot.commandService.send(interaction, `${waveStatus}.`);

        // Сохранение текущего статуса волны в базу данных
        await bot.queueService.setWaveStatus(voiceChannelId, this.waveEnabled);
    }
}