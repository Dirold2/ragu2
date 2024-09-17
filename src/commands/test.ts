import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { CommandService } from "../service/index.js";

@Discord()
export class TestCommand {
    private readonly commandService = new CommandService();

    @Slash({ description: "Тестовая комманда", name: "test" })
    async test(interaction: CommandInteraction): Promise<void> {

        const member = interaction.member as GuildMember;

        if (!member.voice.channel) {
            await this.commandService.send(interaction, "Вы должны находиться в голосовом канале!");
            return;
        }
    }
}