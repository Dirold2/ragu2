import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { QueueService, VoiceService, CommandService } from "../service/index.js";
import { Logger } from "winston";
import logger from '../service/logger.js';


@Discord()
export class SkipCommand {
    private readonly queueService: QueueService;
    private readonly voiceService: VoiceService;
    private readonly commandService: CommandService;
    private readonly logger: Logger;

    constructor() {
        this.queueService = new QueueService();
        this.voiceService = new VoiceService(this.queueService);
        this.commandService = new CommandService();
        this.logger = logger
    }

    @Slash({ description: "Пропустить текущую песню", name: "skip" })
    async skip(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member as GuildMember;
        const channelId = member.voice.channelId;

        if (!channelId) {
            await this.commandService.sendReply(interaction, "Вы должны быть в голосовом канале.");
            return;
        }

        try {
            // Останавливаем текущее воспроизведение
            this.voiceService.stopPlayer();

            // Получаем следующий трек из очереди
            const nextTrack = await this.queueService.getNextTrack(channelId);

            if (nextTrack) {
                // Игрываем следующий трек
                await this.voiceService.playNextTrack(nextTrack);
                
                // Отправляем сообщение о пропуске текущего трека и начале воспроизведения нового
                await this.commandService.sendReply(interaction, "Пропущена текущая песня. Сейчас играет:");
                await this.commandService.sendReply(interaction, nextTrack.info);
            } else {
                // Если нет следующих треков в очереди
                await this.commandService.sendReply(interaction, "Следующей песни в очереди нет. Воспроизведение завершено.");
            }
        } catch (error) {
            this.logger.error('Error skipping track:', error);
            await this.commandService.sendReply(interaction, "Произошла ошибка при попытке пропустить трек.");
        }
    }
}