import { ApplicationCommandOptionType, CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { QueueService, CommandService, VoiceService } from "../service/index.js";

@Discord()
export class VolumeCommand {
    private readonly voiceService: VoiceService;
    private readonly commandService: CommandService;

    constructor(private queueService: QueueService) {
        this.voiceService = new VoiceService(this.queueService);
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
        
        if (!channelId) {
            await this.commandService.sendReply(interaction, "Вы должны быть в голосовом канале.");
            return;
        }
        
        if (volume < 0 || volume > 1) {
            await this.commandService.sendReply(interaction, "Пожалуйста, укажите уровень громкости от 0 до 1.");
            return;
        }
        
        if (!this.voiceService.isConnected()) {
            await this.commandService.sendReply(interaction, "Бот не подключен к голосовому каналу.");
            return;
        }
        
        try {
            // await this.queueService.setVolumeStatus(String(channelId), volume);
            await this.commandService.sendReply(interaction, `Громкость установлена на ${Math.round(volume * 100)}%`);
        } catch (error) {
            await this.commandService.sendReply(interaction, "Произошла ошибка при изменении громкости.");
        }
    }
  }