import { CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { QueueService, CommandService } from "../service/index.js";
import { Logger } from "winston";
import logger from '../utils/logger.js';

interface Track {
    url: string;
    info: string;
    source: string;
    trackId?: string | undefined;
    addedAt?: bigint | undefined;
}

@Discord()
export class QueueCommand {
    private readonly queueService: QueueService;
    private readonly commandService: CommandService;
    private readonly logger: Logger;

    constructor() {
        this.queueService = new QueueService();
        this.commandService = new CommandService();
        this.logger = logger;
    }

    @Slash({ description: "View the current queue", name: "queue" })
    public async queue(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            await this.handleQueueCommand(interaction);
        } catch (error) {
            await this.handleError(interaction, error);
        }
    }

    private async handleQueueCommand(interaction: CommandInteraction): Promise<void> {
        const channelId = this.getVoiceChannelId(interaction);
        if (!channelId) {
            await this.commandService.send(interaction, "You must be in a voice channel to use this command.");
            return;
        }

        const queue = await this.queueService.getQueue(channelId);
        if (queue.tracks.length === 0) {
            await this.commandService.send(interaction, "The queue is empty.");
            return;
        }

        const queueString = this.formatQueueString(queue.tracks);
        await this.commandService.send(interaction, `Current queue:\n${queueString}`);
    }

    private getVoiceChannelId(interaction: CommandInteraction): string | null {
        const member = interaction.member;
        if (!(member instanceof GuildMember)) {
            this.logger.warn("Interaction member is not a GuildMember");
            return null;
        }
        return member.voice.channelId;
    }

    private formatQueueString(tracks: Track[]): string {
        return tracks
            .map((track, index) => `${index + 1}. ${track.info}`)
            .join("\n");
    }

    private async handleError(interaction: CommandInteraction, error: unknown): Promise<void> {
        const errorMsg = error instanceof Error
            ? `An error occurred while fetching the queue: ${error.name}: ${error.message}`
            : "An unexpected error occurred while fetching the queue.";

        this.logger.error("Queue command error:", error);
        await this.commandService.send(interaction, errorMsg);
    }
}