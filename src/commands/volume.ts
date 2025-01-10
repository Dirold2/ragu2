import { ApplicationCommandOptionType, CommandInteraction } from 'discord.js';
import { Discord, Slash, SlashOption } from 'discordx';

import { bot } from '../bot.js';
import logger from '../utils/logger.js';

@Discord()
export class VolumeCommand {
    @Slash({ name: "volume", description: "Adjust the playback volume" })
    async volume(
        @SlashOption({
            description: "0 - 100",
            name: "number",
            type: ApplicationCommandOptionType.Number,
            required: true
        })
        volume: number,
        interaction: CommandInteraction
    ): Promise<void> {
        if (volume < 0 || volume > 100) {
            // Check for valid volume range
            return this.safeReply(interaction, "Please provide a volume between 0 and 100.");
        }

        try {
            // Set volume through playerManager
            await bot.playerManager.setVolume(interaction, volume);
            await this.safeReply(interaction, `Volume successfully set to ${volume}%.`);
        } catch (error) {
            logger.error("Error changing volume:", error);
            await this.safeReply(interaction, "An error occurred while changing the volume. Please try again.");
        }
    }

    private async safeReply(interaction: CommandInteraction, content: string) {
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(content);
            } else {
                await interaction.reply({ content, ephemeral: true });
            }
        } catch (error) {
            logger.error('Error responding to interaction:', error);
        }
    }
}