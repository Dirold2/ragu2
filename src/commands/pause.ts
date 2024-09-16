import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { VoiceService, CommandService, QueueService } from "../service/index.js";
import { AudioPlayerStatus } from "@discordjs/voice";
import logger from "../service/logger.js";
import { Logger } from "winston";

@Discord()
export class PauseCommand {
    private readonly queueService: QueueService;
    private readonly voiceService: VoiceService;
    private readonly commandService: CommandService;
    private readonly logger: Logger;

    constructor() {
        this.queueService = new QueueService();
        this.voiceService = new VoiceService(this.queueService);
        this.commandService = new CommandService();
        this.logger = logger;
    }

    @Slash({ description: `Пауза`, name: `pause` })
    async pause(interaction: CommandInteraction): Promise<void> {
        try {
            await interaction.deferReply({ ephemeral: true });

            const member = interaction.member as GuildMember;
            const channelId = member.voice.channelId;

            if (!channelId) {
                await this.commandService.sendReply(interaction, "Вы должны быть в голосовом канале.");
                return;
            }

            const player = this.voiceService.player;

            console.log(player.state.status)

            if (player.state.status === AudioPlayerStatus.Idle) {
                await this.commandService.sendReply(interaction, "Нет воспроизводимого аудио.");
                return;
            }

            if (player.state.status === AudioPlayerStatus.Paused) {
                player.unpause();
                await this.commandService.sendReply(interaction, "Аудио продолжено.");
            } else {
                player.pause();
                await this.commandService.sendReply(interaction, "Аудио на паузе.");
            }

            this.logger.info(`Player status: ${player.state.status}`);

        } catch (error) {
            logger.error('Ошибка выполнения команды /pause:', error);
            await this.commandService.sendReply(interaction, 'Произошла ошибка при выполнении команды');
        }
    }
}