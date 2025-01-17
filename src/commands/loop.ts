import { CommandInteraction } from 'discord.js';
import { Discord, Slash } from 'discordx';

import { bot } from '../bot.js';
import logger from '../utils/logger.js';

@Discord()
export class LoopCommand {
    @Slash({ name: 'loop', description: "Повтор текущего трека" })
    async toggleLoop(interaction: CommandInteraction) {
        try {
            const guildId = interaction.guildId;
            if (!guildId) {
                return await bot.commandService.reply(interaction, "ID сервера не найден.");
            }

            const player = bot.playerManager.getPlayer(guildId);
            if (!player) {
                return await bot.commandService.reply(interaction, "Плеер не найден.");
            }

            player.loop = !player.loop; // Предполагается, что у плеера есть свойство loop

            bot.queueService.setLoop(guildId, player.loop);

            return await bot.commandService.reply(interaction, `Повтор трека ${player.loop ? `включен трек: ${player.lastTrack?.info}` : 'выключен'}.`);
        } catch (error) {
            logger.error('Ошибка при переключении повтора трека:', error);
            return await bot.commandService.reply(interaction, "Произошла ошибка при переключении повтора трека.");
        }
    }
} 