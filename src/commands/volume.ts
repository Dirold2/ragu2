import { ApplicationCommandOptionType, CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { QueueService, CommandService } from "../service/index.js";

@Discord()
export class VolumeCommand {
    private readonly commandService: CommandService;

    constructor(private queueService: QueueService) {
      this.commandService = new CommandService();
    }

    @Slash({ description: "Управление громкостью", name: "volume" })
    async setVolume(
        @SlashOption({
            description: "громкость",
            name: "volume",
            required: true,
            type: ApplicationCommandOptionType.Number,
        }) volume: number,
        interaction: CommandInteraction
    ): Promise<void> {
        const member = interaction.member as GuildMember;
        const channelId = member.voice.channelId;

        if (volume === undefined || volume === null) {
            await this.commandService.sendReply(interaction, "Пожалуйста, укажите уровень громкости!");
            return;
        }

        if (isNaN(volume) || volume < 0 || volume > 1) {
            await interaction.reply("Пожалуйста, укажите уровень громкости от 0 до 1.");
            return;
        }

        try {
            await this.queueService.setVolumeStatus(String(channelId), volume);
            await this.commandService.sendReply(interaction, `Громкость установлена на ${Math.round(volume * 100)}%`);
        } catch (error) {
            await this.commandService.sendReply(interaction, "Произошла ошибка при изменении громкости.");
        }
    }
  }