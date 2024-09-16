import { Discord, Slash, SlashOption } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, TextChannel } from "discord.js";
import { QueueService, TrackService, CommandService } from "../service/index.js";
import { Logger } from "winston";
import logger from '../service/logger.js';

@Discord()
export class PlayCommands {
    private readonly queueService: QueueService;
    private readonly trackService: TrackService;
    private readonly commandService: CommandService;
    private readonly logger: Logger;

    constructor() {
        this.queueService = new QueueService();
        this.trackService = new TrackService(this.queueService);
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
            const searchResults = await this.trackService.searchTrack(trackName);

            if (!searchResults?.length) {
                await this.commandService.sendReply(interaction, "Track not found!", true);
                return;
            }

            const options = this.trackService.buildTrackOptions(searchResults);
            const row = this.trackService.buildTrackSelectMenu(options);

            const message = await interaction.followUp({
                content: "Please select a track:",
                components: [row],
            });

            if (interaction.channel instanceof TextChannel) {
                await this.trackService.handleTrackSelection(interaction, searchResults, message);
            } else {
                await this.commandService.sendReply(interaction, "Error: This action cannot be performed in this type of channel.");
            }
        } catch (error) {
            this.logger.error('Error in play command:', error);
            await this.commandService.sendReply(interaction, "An error occurred while processing your request.");
        }
    }
}