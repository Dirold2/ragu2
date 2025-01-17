import {
    AutocompleteInteraction, CacheType, CommandInteraction, DiscordAPIError, InteractionResponse,
    Message
} from 'discord.js';
import logger from '../utils/logger.js';
import { MESSAGES } from '../messages.js';

export default class CommandService {
    public async send(
        interaction: CommandInteraction<CacheType> | AutocompleteInteraction<CacheType>,
        message: string,
        ephemeral: boolean = true
    ): Promise<InteractionResponse<boolean> | Message<boolean> | void> {
        if (!interaction.isRepliable()) return;

        try {
            if (interaction.replied || interaction.deferred) {
                logger.debug(`Editing reply for interaction ID: ${interaction.id}`);
                return interaction.editReply({ content: message });
            } else {
                logger.debug(`Sending new reply for interaction ID: ${interaction.id}`);
                return interaction.reply({ content: message, ephemeral });
            }
        } catch (error) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.editReply(message);
            }
            this.handleInteractionError(error, interaction);
        }
    }

    public async delete(message: Message): Promise<void> {
        if (!message.deletable) {
            logger.debug(MESSAGES.MESSAGE_CANNOT_BE_DELETED(message.id));
            return;
        }

        try {
            logger.debug(`Attempting to delete message with ID: ${message.id}`);
            await message.delete();
            logger.debug(MESSAGES.MESSAGE_DELETED(message.id));
        } catch (error) {
            this.handleMessageError(error, message);
        }
    }

    public async reply(
        interaction: CommandInteraction, 
        content: string
    ): Promise<void> {
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content });
            } else {
                await interaction.reply({ content, ephemeral: true });
            }
        } catch (error) {
            logger.error('Reply error:', error);
        }
    }

    private handleInteractionError(error: unknown, interaction: CommandInteraction<CacheType>): void {
        if (error instanceof DiscordAPIError) {
            this.handleDiscordAPIError(error, `interaction with ID: ${interaction.id}`);
        } else {
            logger.error(MESSAGES.UNKNOWN_ERROR_INTERACTION(interaction.id), error);
        }
    }

    private handleMessageError(error: unknown, message: Message): void {
        if (error instanceof DiscordAPIError) {
            this.handleDiscordAPIError(error, `message with ID: ${message.id}`);
        } else {
            logger.error(MESSAGES.UNKNOWN_ERROR_DELETING_MESSAGE(message.id), error);
        }
    }

    private handleDiscordAPIError(error: DiscordAPIError, context: string): void {
        switch (error.code) {
            case 10008:
            case 10062:
                logger.debug(MESSAGES.INTERACTION_NO_LONGER_EXISTS(context));
                break;
            default:
                logger.error(MESSAGES.DISCORD_API_ERROR(Number(error.code), context, error.message));
        }
    }
}