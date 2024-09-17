import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { PlayerService, CommandService } from "../service/index.js";
import logger from "../utils/logger.js";

@Discord()
export class PauseCommand {
    private readonly playerService: PlayerService;
    private readonly commandService: CommandService;

    constructor() {
        this.playerService = new PlayerService();
        this.commandService = new CommandService();
    }

    @Slash({ description: `Пауза`, name: `pause` })
    async pause(interaction: CommandInteraction): Promise<void> {
        try {
            await interaction.deferReply({ ephemeral: true });

            const member = interaction.member as GuildMember;
            const channelId = member.voice.channelId;

            if (!channelId) {
                await this.commandService.send(interaction, "Вы должны быть в голосовом канале.");
                return;
            }

            this.playerService.togglePause()
            await this.commandService.send(interaction, "Пауза.");
        } catch (error) {
            logger.error('Ошибка выполнения команды /pause:', error);
            await this.commandService.send(interaction, 'Произошла ошибка при выполнении команды');
        }
    }
}