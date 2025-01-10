import { ApplicationCommandOptionType, CommandInteraction } from 'discord.js';
import { Discord, Slash, SlashOption } from 'discordx';

import { bot } from '../bot.js';
import logger from '../utils/logger.js';

@Discord()
export class PlaylistCommand {
    @Slash({ name: 'playlist', description: "Добавить плейлист из Яндекс.Музыки" })
    async addPlaylist(
        @SlashOption({ name: 'url', description: "Ссылка на плейлист", required: true, type: ApplicationCommandOptionType.String, }) url: string,
        interaction: CommandInteraction
    ) {
        await interaction.deferReply();

        const playlistTracks = await bot.nameService.searchName(url);

        if (!playlistTracks) {
            return this.safeReply(interaction, "Не удалось получить информацию о плейлисте. Проверьте ссылку.");
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
            logger.error('Error replying to interaction:', error);
        }
    }
}