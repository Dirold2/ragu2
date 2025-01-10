import { CommandInteraction } from 'discord.js';
import { Discord, Slash } from 'discordx';

import { bot } from '../bot.js';
import logger from '../utils/logger.js';

@Discord()
export class SkipCommand {
    @Slash({ description: "Пропустить текущую песню", name: "skip" })
    async skip(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            await bot.playerManager.skip(interaction);
        } catch (error) {
            logger.error('Error skipping track:', error);
            await bot.commandService.send(interaction, "Произошла ошибка при попытке пропустить трек.");
        }
    }
}