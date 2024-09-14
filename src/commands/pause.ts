import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";
import { VoiceService, CommandService, QueueService } from "../service/index.ts";
import { AudioPlayer, createAudioPlayer } from "@discordjs/voice";

import { ILogObj, Logger } from "tslog";

const logger: Logger<ILogObj> = new Logger();

@Discord()
export class PauseCommand {
    private readonly queueService = new QueueService()
    private readonly voiceService = new VoiceService(this.queueService);
    private player: AudioPlayer = createAudioPlayer();
    private readonly commandService = new CommandService();
    private isPaused = false;

    @Slash({ description: `Пауза`, name: `pause` })
    async pause(interaction: CommandInteraction): Promise<void> {
        try {
            await interaction.deferReply({ ephemeral: true });

            this.isPaused = !this.isPaused;

            logger.info(`[isPaused]: ${this.isPaused}`);

            logger.info(`[status]: ${this.player.state.status }`);

            if (this.voiceService.isPlaying() && !this.isPaused) {
                this.voiceService.pause();
                await this.commandService.sendReply(interaction, "Аудио на паузе");
            } else if (this.voiceService.isPaused() && this.isPaused) {
                this.voiceService.unpause();
                await this.commandService.sendReply(interaction, "Аудио продолжено");
            }

        } catch (error) {
            logger.error('Ошибка выполнения команды /pause:', error);
            await this.commandService.sendReply(interaction, 'Произошла ошибка при выполнении команды');
        }
    }
}