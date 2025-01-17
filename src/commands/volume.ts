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
            return bot.commandService.reply(interaction, "Please provide a volume between 0 and 100.");
        }

        try {
            // Set volume through playerManager
            await bot.playerManager.setVolume(interaction, volume);
            await bot.commandService.reply(interaction, `Volume successfully set to ${volume}%.`);
        } catch (error) {
            logger.error("Error changing volume:", error);
            await bot.commandService.reply(interaction, "An error occurred while changing the volume. Please try again.");
        }
    }
}