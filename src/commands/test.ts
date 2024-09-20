import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { bot } from "../bot.js";

@Discord()
export class TestCommand {
    @Slash({ description: "Тестовая комманда", name: "test" })
    async test(interaction: CommandInteraction): Promise<void> {
        const member = interaction.member as GuildMember;

        if (!member.voice.channel) {
            await bot.commandService.send(interaction, "Вы должны находиться в голосовом канале!");
            return;
        }

        await bot.commandService.send(interaction, "Тестовая команда выполнена успешно!");
    }
}