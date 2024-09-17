import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { QueueService, PlayerService, CommandService } from "../service/index.js";
import { Logger } from "winston";
import logger from '../utils/logger.js';


@Discord()
export class SkipCommand {
    private readonly queueService: QueueService;
    private readonly playerService: PlayerService;
    private readonly commandService: CommandService;
    private readonly logger: Logger;

    constructor() {
        this.queueService = new QueueService();
        this.playerService = new PlayerService();
        this.commandService = new CommandService();
        this.logger = logger
    }

    @Slash({ description: "Пропустить текущую песню", name: "skip" })
    async skip(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member as GuildMember;
        const channelId = member.voice.channelId;

        if (!channelId) {
            await this.commandService.send(interaction, "Вы должны быть в голосовом канале.");
            return;
        }

        try {
            // Останавливаем текущее воспроизведение
            this.playerService.stop();

            // Получаем следующий трек из очереди
            const nextTrack = await this.queueService.getTrack(channelId);

            if (nextTrack) {
                // Игрываем следующий трек
                await this.playerService.playOrQueueTrack(channelId, nextTrack);
                
                // Отправляем сообщение о пропуске текущего трека и начале воспроизведения нового
                await this.commandService.send(interaction, "Пропущена текущая песня. Сейчас играет:");
                await this.commandService.send(interaction, nextTrack.info);
            } else {
                // Если нет следующих треков в очереди
                await this.commandService.send(interaction, "Следующей песни в очереди нет. Воспроизведение завершено.");
            }
        } catch (error) {
            this.logger.error('Error skipping track:', error);
            await this.commandService.send(interaction, "Произошла ошибка при попытке пропустить трек.");
        }
    }
}