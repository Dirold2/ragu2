import {
    CommandInteraction,
    Message,
    DiscordAPIError,
    InteractionResponse,
    CacheType,
    AutocompleteInteraction
} from "discord.js";
import { Logger } from 'winston';
import logger from '../utils/logger.js';

export class CommandService {
    private readonly logger: Logger;

    constructor() {
        this.logger = logger;
    }

    /**
     * Sends a reply to a Discord interaction.
     * @param {CommandInteraction<CacheType>} interaction - The interaction to reply to.
     * @param {string} message - The message content.
     * @param {boolean} [ephemeral=true] - Whether the reply should be ephemeral.
     * @returns {Promise<InteractionResponse<boolean> | Message<boolean> | void>}
     */
    public async send(
        interaction: CommandInteraction<CacheType> | AutocompleteInteraction<CacheType>,
        message: string,
        ephemeral: boolean = true
    ): Promise<InteractionResponse<boolean> | Message<boolean> | void> {
        if (!interaction.isRepliable()) {
            return;
        }

        try {
            if (interaction.replied || interaction.deferred) {
                this.logger.debug(`Editing reply for interaction ID: ${interaction.id}`);
                return interaction.editReply({ content: message });
            } else {
                this.logger.debug(`Sending new reply for interaction ID: ${interaction.id}`);
                return interaction.reply({ content: message, ephemeral });
            }
        } catch (error) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.editReply(message);
            }
            this.handleInteractionError(error, interaction);
        }
    }

    /**
     * Safely deletes a message.
     * @param {Message} message - The message to delete.
     * @returns {Promise<void>}
     */
    public async delete(message: Message): Promise<void> {
        if (!message.deletable) {
            this.logger.debug(`Message with ID: ${message.id} cannot be deleted or does not exist.`);
            return;
        }

        try {
            this.logger.debug(`Attempting to delete message with ID: ${message.id}`);
            await message.delete();
            this.logger.debug(`Message with ID: ${message.id} successfully deleted.`);
        } catch (error) {
            this.handleMessageError(error, message);
        }
    }

    private handleInteractionError(error: unknown, interaction: CommandInteraction<CacheType>): void {
        if (error instanceof DiscordAPIError) {
            this.handleDiscordAPIError(error, `interaction with ID: ${interaction.id}`);
        } else {
            this.logger.error(`Unknown error during interaction with ID: ${interaction.id}:`, error);
        }
    }

    private handleMessageError(error: unknown, message: Message): void {
        if (error instanceof DiscordAPIError) {
            this.handleDiscordAPIError(error, `message with ID: ${message.id}`);
        } else {
            this.logger.error(`Unknown error while deleting message with ID: ${message.id}:`, error);
        }
    }

    private handleDiscordAPIError(error: DiscordAPIError, context: string): void {
        switch (error.code) {
            case 10008:
                this.logger.debug(`${context} no longer exists (Unknown Message).`);
                break;
            case 10062:
                this.logger.debug(`${context} no longer exists (Unknown Interaction).`);
                break;
            default:
                this.logger.error(`Discord API Error (${error.code}) for ${context}: ${error.message}`);
        }
    }
}