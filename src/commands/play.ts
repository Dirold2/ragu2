import { Discord, Slash, SlashOption } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, TextChannel } from "discord.js";
import { QueueService, TrackService, CommandService } from "../service/index.ts";

import { ILogObj, Logger } from "tslog";

const logger: Logger<ILogObj> = new Logger();

@Discord()
export class PlayCommands {
    private readonly queueService = new QueueService();
    private readonly trackService = new TrackService(this.queueService);
    private readonly commandService = new CommandService();
    
    @Slash({ description: "play", name: "play" })
    async play(
      @SlashOption({
        description: "Название трека",
        name: "track",
        required: true,
        type: ApplicationCommandOptionType.String,
      }) trackName: string,
      interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply();
        
        if (!trackName) {
            await this.commandService.sendReply(interaction, "Пожалуйста, укажите название трека!");
            return;
        }
        
        const searchResults = await this.trackService.searchTrack(trackName);
        
        if (!searchResults?.length) {
            await this.commandService.sendReply(interaction, "Трек не найден!", true);
            return;
        }
        
        const options = this.trackService.buildTrackOptions(searchResults);
        
        try {
            const row = this.trackService.buildTrackSelectMenu(options);
            
            const message = await interaction.followUp({
                content: "Пожалуйста, выберите трек:",
                components: [row],
            });
        
            if (interaction.channel instanceof TextChannel) {
                this.trackService.handleTrackSelection(interaction, searchResults, message);
            } else {
                await this.commandService.sendReply(interaction, "Ошибка: это действие невозможно выполнить в этом типе канала.");
            }
        } catch (error) {
            logger.error('Error creating Select Menu:', error);
            await this.commandService.sendReply(interaction, "Произошла ошибка при создании меню выбора трека.");
        }
    }
}