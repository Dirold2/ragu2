import {
	AutocompleteInteraction,
	CacheType,
	CommandInteraction,
	DiscordAPIError,
	InteractionResponse,
	Message,
	MessageFlags,
} from "discord.js";
import logger from "../utils/logger.js";
import { bot } from "../bot.js";
import { setLocaleMessages } from "../locales/index.js";

/**
 * Service for handling Discord command interactions and messages
 */
export default class CommandService {
	/**
	 * Sends a response to a Discord interaction
	 * @param interaction - The Discord interaction to respond to
	 * @param message - The message content to send
	 * @param ephemeral - Whether the message should be ephemeral (only visible to the command user)
	 * @returns Promise resolving to the interaction response or void
	 */
	public async send(
		interaction:
			| CommandInteraction<CacheType>
			| AutocompleteInteraction<CacheType>,
		message: string,
	): Promise<InteractionResponse<boolean> | Message<boolean> | void> {
		if (!interaction.isRepliable()) return;
		await setLocaleMessages(interaction);

		try {
			if (interaction.replied || interaction.deferred) {
				logger.debug(
					`${bot.loggerMessages.EDITING_REPLY_FOR_INTERACTION_ID(interaction.id)}`,
				);
				return interaction.editReply({ content: message });
			}

			logger.debug(
				`${bot.loggerMessages.SENDING_NEW_REPLY_FOR_INTERACTION_ID(interaction.id)}`,
			);
			return interaction.reply({
				content: message,
				flags: MessageFlags.Ephemeral,
			});
		} catch (error) {
			this.handleInteractionError(error, interaction);
		}
	}

	/**
	 * Deletes a Discord message
	 * @param message - The message to delete
	 */
	public async delete(message: Message): Promise<void> {
		if (!message.deletable) {
			logger.debug(`${bot.loggerMessages.MESSAGE_NOT_DELETABLE(message.id)}`);
			return;
		}

		try {
			await message.delete();
			logger.debug(`${bot.loggerMessages.MESSAGE_DELETED(message.id)}`);
		} catch (error) {
			this.handleMessageError(error, message);
		}
	}

	/**
	 * Replies to a command interaction
	 * @param interaction - The interaction to reply to
	 * @param content - The content of the reply
	 */
	public async reply(
		interaction: CommandInteraction,
		content: string,
	): Promise<void> {
		await setLocaleMessages(interaction);
		try {
			if (!interaction.isRepliable()) {
				logger.warn(
					`${bot.loggerMessages.INTERACTION_NOT_REPLIABLE(interaction.id)}`,
				);
				return;
			}

			if (interaction.replied) {
				logger.warn(
					`${bot.loggerMessages.INTERACTION_ALREADY_REPLIED_TO(interaction.id)}`,
				);
				return;
			}

			await interaction[interaction.deferred ? "editReply" : "reply"]({
				content,
				flags: interaction.deferred ? undefined : MessageFlags.Ephemeral,
			});
		} catch (error) {
			if (error instanceof DiscordAPIError && error.code === 10062) {
				logger.warn(
					`${bot.loggerMessages.INTERACTION_EXPIRED(interaction.id)}`,
				);
			} else {
				logger.error(`${bot.loggerMessages.REPLY_ERROR}`, error);
			}
		}
	}

	/**
	 * Handles Discord API errors for interactions
	 * @private
	 */
	private handleInteractionError(
		error: unknown,
		interaction: CommandInteraction<CacheType>,
	): void {
		if (error instanceof DiscordAPIError) {
			this.handleDiscordAPIError(
				error,
				`interaction with ID: ${interaction.id}`,
			);
		} else {
			logger.error(
				`${bot.loggerMessages.UNKNOWN_ERROR_INTERACTING_WITH_ID(interaction.id)}`,
				error,
			);
		}
	}

	/**
	 * Handles Discord API errors for messages
	 * @private
	 */
	private handleMessageError(error: unknown, message: Message): void {
		if (error instanceof DiscordAPIError) {
			this.handleDiscordAPIError(error, `message with ID: ${message.id}`);
		} else {
			logger.error(
				`${bot.loggerMessages.UNKNOWN_ERROR_DELETING_MESSAGE_WITH_ID(message.id)}`,
				error,
			);
		}
	}

	/**
	 * Handles specific Discord API error codes
	 * @private
	 */
	private handleDiscordAPIError(error: DiscordAPIError, context: string): void {
		const errorCode = Number(error.code);
		const isExpiredInteraction = [10008, 10062].includes(errorCode);

		if (isExpiredInteraction) {
			logger.debug(`${bot.loggerMessages.INTERACTION_EXPIRED(context)}`);
		} else {
			logger.error(
				`${bot.loggerMessages.DISCORD_API_ERROR(errorCode, context)}: ${error.message}`,
			);
		}
	}
}
