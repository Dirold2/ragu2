import { ApplicationCommandOptionType, CommandInteraction, GuildMember } from 'discord.js';
import { Discord, Slash, SlashOption } from 'discordx';

import { bot } from '../bot.js';
import YandexMusicPlugin from '../plugins/YandexMusicPlugin.js';
import { logger } from '../utils/index.js';

@Discord()
export class TestCommand {
    private yandexMusicPlugin: YandexMusicPlugin;

    constructor() {
        this.yandexMusicPlugin = new YandexMusicPlugin();
    }

    @Slash({ description: "Тестовая комманда", name: "test" })
    async test(
        @SlashOption({
            description: "Playlist URL",
            name: "playlist",
            type: ApplicationCommandOptionType.String,
            required: true,
        })
        playlist: string,
        interaction: CommandInteraction
    ): Promise<void> {
        const member = interaction.member as GuildMember;

        if (!member.voice.channel) {
            await this.safeReply(interaction, "Вы должны находиться в голосовом канале!");
            return;
        }

        await interaction.deferReply();

        const playlistTracks = await bot.nameService.searchName(playlist);

        if (!playlistTracks) {
            return this.safeReply(interaction, "Не удалось получить информацию о плейлисте. Проверьте ссылку.");
        }

        try {
            const playlistInfo = await this.yandexMusicPlugin.getPlaylistURL(playlist);
            if (playlistInfo) {
                await this.safeReply(interaction, "Информация о плейлисте получена успешно!");
            } else {
                await this.safeReply(interaction, "Не удалось получить информацию о плейлисте.");
            }
        } catch (error) {
            logger.error('Error in test command:', error);
            await this.safeReply(interaction, "Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте снова позже.");
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