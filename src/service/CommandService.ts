import {
    CommandInteraction,
    Message,
    DiscordAPIError,
    InteractionResponse,
    CacheType
} from "discord.js";
import { Logger, ILogObj } from "tslog";

export class CommandService {
    private readonly logger: Logger<ILogObj>;

    /**
     * Initializes a new instance of the CommandService class with a logger.
     */
    constructor() {
        this.logger = new Logger();
    }

    /**
     * Sends a reply to a Discord interaction.
     *
     * @param {CommandInteraction<CacheType>} interaction - The interaction object from Discord.
     * @param {string} message - The message to reply with.
     * @param {boolean} [ephemeral=true] - Whether the reply should be ephemeral (only visible to the user).
     * @returns {Promise<InteractionResponse<boolean> | Message<boolean> | void>} A promise that resolves to the reply or nothing.
     */
    public async sendReply(
        interaction: CommandInteraction<CacheType>,
        message: string,
        ephemeral: boolean = true
    ): Promise<InteractionResponse<boolean> | Message<boolean> | void> {
        if (!interaction.isRepliable()) {
            this.logger.error(`Error: Interaction is not repliable. Interaction ID: ${interaction.id}`);
            return;
        }

        try {
            if (interaction.replied || interaction.deferred) {
                this.logger.info(`Editing reply for interaction ID: ${interaction.id}`);
                return await interaction.editReply({ content: message });
            } else {
                this.logger.info(`Sending new reply for interaction ID: ${interaction.id}`);
                return await interaction.reply({ content: message, ephemeral });
            }
        } catch (error) {
            this.handleInteractionError(error, interaction);
        }
    }

    /**
     * Deletes a message safely.
     *
     * @param {Message} message - The message object to be deleted.
     * @returns {Promise<void>} A promise that resolves once the message is deleted, or if deletion fails.
     */
    public async deleteMessageSafely(message: Message): Promise<void> {
        if (!message.deletable) {
            this.logger.warn(`Message with ID: ${message.id} cannot be deleted or does not exist.`);
            return;
        }

        try {
            this.logger.info(`Attempting to delete message with ID: ${message.id}`);
            await message.delete();
            this.logger.info(`Message with ID: ${message.id} successfully deleted.`);
        } catch (error) {
            this.handleMessageError(error, message);
        }
    }

    /**
     * Handles errors that occur during an interaction.
     *
     * @param {unknown} error - The error object that was thrown.
     * @param {CommandInteraction<CacheType>} interaction - The interaction object in which the error occurred.
     * @private
     */
    private handleInteractionError(error: unknown, interaction: CommandInteraction<CacheType>): void {
        if (error instanceof DiscordAPIError) {
            this.handleDiscordAPIError(error, `interaction with ID: ${interaction.id}`);
        } else {
            this.logger.error(`Unknown error during interaction with ID: ${interaction.id}:`, error);
        }
    }

    /**
     * Handles errors that occur while deleting a message.
     *
     * @param {unknown} error - The error object that was thrown.
     * @param {Message} message - The message object in which the error occurred.
     * @private
     */
    private handleMessageError(error: unknown, message: Message): void {
        if (error instanceof DiscordAPIError) {
            this.handleDiscordAPIError(error, `message with ID: ${message.id}`);
        } else {
            this.logger.error(`Unknown error while deleting message with ID: ${message.id}:`, error);
        }
    }

    /**
     * Handles Discord API errors and logs them accordingly.
     *
     * @param {DiscordAPIError} error - The Discord API error.
     * @param {string} context - A description of the context (interaction or message) in which the error occurred.
     * @private
     */
    private handleDiscordAPIError(error: DiscordAPIError, context: string): void {
        switch (error.code) {
            case 10008:
                this.logger.warn(`${context} no longer exists (Unknown Message).`);
                break;
            case 10062:
                this.logger.warn(`${context} no longer exists (Unknown Interaction).`);
                break;
            default:
                this.logger.error(`Discord API Error (${error.code}) for ${context}: ${error.message}`);
        }
    }
}