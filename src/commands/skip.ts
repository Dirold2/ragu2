import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";
import { PlayerService, CommandService } from "../service/index.js";
import { Logger } from "winston";
import logger from '../utils/logger.js';


@Discord()
export class SkipCommand {
    private readonly playerService: PlayerService;
    private readonly commandService: CommandService;
    private readonly logger: Logger;


    constructor() {
        this.playerService = new PlayerService();
        this.commandService = new CommandService();
        this.logger = logger
    }

    @Slash({ description: "Пропустить текущую песню", name: "skip" })
    async skip(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            this.playerService.skip(interaction)
        } catch (error) {
            this.logger.error('Error skipping track:', error);
            await this.commandService.send(interaction, "Произошла ошибка при попытке пропустить трек.");
        }
    }
}