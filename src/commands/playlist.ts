import { ApplicationCommandOptionType, CommandInteraction } from 'discord.js';
import { Discord, Slash, SlashOption } from 'discordx';

import { bot } from '../bot.js';
import logger from '../utils/logger.js';

@Discord()
export class PlaylistCommand {
    @Slash({ name: 'playlist', description: "Добавить плейлист из Яндекс.Музыки" })
    async addPlaylist(
        @SlashOption({ name: 'url', description: "Ссылка на плейлист", required: true, type: ApplicationCommandOptionType.String }) url: string,
        interaction: CommandInteraction
    ) {
        try {
            const playlistTracks = await bot.nameService.searchName(url);

            if (!playlistTracks) {
                return bot.commandService.reply(interaction, "Не удалось получить информацию о плейлисте. Проверьте ссылку.");
            }

            // Дополнительная логика для обработки плейлиста
            // Например, отправка сообщения с количеством треков
            await bot.commandService.reply(interaction, `Плейлист успешно добавлен. Количество треков: ${playlistTracks.length}`);
        } catch (error) {
            logger.error('Ошибка при добавлении плейлиста:', error);
            await bot.commandService.reply(interaction, "Произошла ошибка при обработке плейлиста.");
        }
    }
}