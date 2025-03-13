import {
	AutocompleteInteraction,
	CacheType,
	CommandInteraction,
	DiscordAPIError,
	InteractionResponse,
	Message,
	MessageFlags,
} from "discord.js";
import { bot } from "../bot.js";

/**
 * Service for handling Discord command interactions and messages
 */
export default class CommandService {
	private readonly logger = bot.logger;

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

		try {
			if (interaction.replied || interaction.deferred) {
				this.logger.debug(
					bot.locale.t('commands.interaction.editing_reply', { id: interaction.id })
				);
				return interaction.editReply({ content: message });
			}

			this.logger.debug(
				bot.locale.t('commands.interaction.sending_reply', { id: interaction.id })
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
			this.logger.debug(
				bot.locale.t('commands.message.not_deletable', { id: message.id })
			);
			return;
		}

		try {
			await message.delete();
			this.logger.debug(
				bot.locale.t('commands.message.deleted', { id: message.id })
			);
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
		try {
			if (!interaction.isRepliable()) {
				this.logger.warn(
					bot.locale.t('commands.interaction.not_repliable', { id: interaction.id }),
					{ url: new Error().stack?.split('\n')[1] }
				);
				return;
			}

			if (interaction.replied) {
				this.logger.warn(
					bot.locale.t('commands.interaction.already_replied', { id: interaction.id }),
					{ url: new Error().stack?.split('\n')[1] }
				);
				return;
			}

			if (interaction.deferred) {
				await interaction.editReply({ content });
			} else {
				await interaction.reply({ content, ephemeral: true });
			}
		} catch (error) {
			this.logger.error(bot.locale.t('errors.reply_error'), error);
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
			this.logger.error(
				bot.locale.t('commands.interaction.unknown_error', { id: interaction.id }),
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
			this.logger.error(
				bot.locale.t('commands.message.unknown_error', { id: message.id }),
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
			this.logger.debug(
				bot.locale.t('commands.interaction.expired', { context })
			);
		} else {
			this.logger.error(
				bot.locale.t('errors.discord_api', { 
					code: errorCode,
					context,
					message: error.message 
				})
			);
		}
	}
}
