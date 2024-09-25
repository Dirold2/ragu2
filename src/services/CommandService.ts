import { CommandInteraction, Message, 
    DiscordAPIError, InteractionResponse, 
    CacheType, AutocompleteInteraction 
} from "discord.js";
import logger from '../utils/logger.js';

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
            logger.debug(`Message with ID: ${message.id} cannot be deleted or does not exist.`);
            return;
        }

        try {
            logger.debug(`Attempting to delete message with ID: ${message.id}`);
            await message.delete();
            logger.debug(`Message with ID: ${message.id} successfully deleted.`);
        } catch (error) {
            this.handleMessageError(error, message);
        }
    }

    private handleInteractionError(error: unknown, interaction: CommandInteraction<CacheType>): void {
        if (error instanceof DiscordAPIError) {
            this.handleDiscordAPIError(error, `interaction with ID: ${interaction.id}`);
        } else {
            logger.error(`Unknown error during interaction with ID: ${interaction.id}:`, error);
        }
    }

    private handleMessageError(error: unknown, message: Message): void {
        if (error instanceof DiscordAPIError) {
            this.handleDiscordAPIError(error, `message with ID: ${message.id}`);
        } else {
            logger.error(`Unknown error while deleting message with ID: ${message.id}:`, error);
        }
    }

    private handleDiscordAPIError(error: DiscordAPIError, context: string): void {
        switch (error.code) {
            case 10008:
            case 10062:
                logger.debug(`${context} no longer exists (Unknown ${error.code === 10008 ? 'Message' : 'Interaction'}).`);
                break;
            default:
                logger.error(`Discord API Error (${error.code}) for ${context}: ${error.message}`);
        }
    }
}