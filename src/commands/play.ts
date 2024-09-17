import { Discord, Slash, SlashOption } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, TextChannel } from "discord.js";
import { NameService, CommandService } from "../service/index.js";
import { Logger } from "winston";
import logger from '../utils/logger.js';

@Discord()
export class PlayCommands {
    private readonly nameService: NameService;
    private readonly commandService: CommandService;
    private readonly logger: Logger;

    constructor() {
        this.nameService = new NameService();
        this.commandService = new CommandService();
        this.logger = logger
    }

    @Slash({ description: "Play a track", name: "play" })
    async play(
        @SlashOption({
            description: "Track name",
            name: "track",
            required: true,
            type: ApplicationCommandOptionType.String,
        })
        trackName: string,
        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply();

        try {
            const searchResults = await this.nameService.searchTrack(trackName);

            if (!searchResults?.length) {
                await this.commandService.send(interaction, "Track not found!", true);
                return;
            }

            const row = this.nameService.buildTrackOptions(searchResults);

            const message = await interaction.followUp({
                content: "Please select a track:",
                components: [row],
            });

            if (interaction.channel instanceof TextChannel) {
                await this.nameService.handleTrackSelection(interaction, searchResults, message);
            } else {
                await this.commandService.send(interaction, "Error: This action cannot be performed in this type of channel.");
            }
        } catch (error) {
            this.logger.error('Error in play command:', error);
            await this.commandService.send(interaction, "An error occurred while processing your request.");
        }
    }
}