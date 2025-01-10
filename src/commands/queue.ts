import { CommandInteraction, GuildMember } from 'discord.js';
import { Discord, Slash } from 'discordx';

import { bot } from '../bot.js';
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
            await bot.commandService.send(interaction, "You must be in a voice channel to use this command.");
            return;
        }

        const queue = await bot.queueService.getQueue(channelId);
        if (queue.tracks.length === 0) {
            await bot.commandService.send(interaction, "The queue is empty.");
            return;
        }

        const queueString = this.formatQueueString(queue.tracks);
        await bot.commandService.send(interaction, `Current queue:\n${queueString}`);
    }

    private getVoiceChannelId(interaction: CommandInteraction): string | null {
        const member = interaction.member;
        if (!(member instanceof GuildMember)) {
            logger.warn("Interaction member is not a GuildMember");
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

        logger.error("Queue command error:", error);
        await bot.commandService.send(interaction, errorMsg);
    }
}