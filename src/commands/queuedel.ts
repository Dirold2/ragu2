import { CommandInteraction, GuildMember } from 'discord.js';
import { Discord, Slash } from 'discordx';

import { bot } from '../bot.js';

@Discord()
export class QueueDelCommand {
    @Slash({ description: "Очистить очередь", name: "queuedel" })
    async queuedel(interaction: CommandInteraction): Promise<void> {
        const member = interaction.member as GuildMember;

        if (!member.voice.channel) {
            await bot.commandService.reply(interaction, "Вы должны находиться в голосовом канале!");
            return;
        }

        const channelId = member.voice.channel.id;

        await bot.queueService.clearQueue(channelId);
        await bot.commandService.reply(interaction, 'Очередь успешно очищена');
    }
}