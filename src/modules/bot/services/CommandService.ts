import {
	type AutocompleteInteraction,
	type CacheType,
	type CommandInteraction,
	DiscordAPIError,
	type InteractionResponse,
	type Message,
	MessageFlags,
} from "discord.js";
import { bot } from "../bot.js";

/**
 * Сервис для обработки взаимодействий и сообщений команд Discord
 */
export default class CommandService {
	private readonly logger = bot.logger;

	// Добавляем кэш для оптимизации
	private readonly interactionCache = new Map<
		string,
		{ content: string; timestamp: number }
	>();
	private readonly CACHE_TTL = 60000; // 1 минута

	/**
	 * Отправляет ответ на взаимодействие Discord
	 */
	public async send(
		interaction:
			| CommandInteraction<CacheType>
			| AutocompleteInteraction<CacheType>,
		message: string,
	): Promise<InteractionResponse<boolean> | Message<boolean> | void> {
		if (!interaction.isRepliable()) return;

		try {
			// Проверяем кэш для предотвращения дублирования сообщений
			const cacheKey = `${interaction.id}-${interaction.user.id}`;
			const cachedResponse = this.interactionCache.get(cacheKey);

			if (
				cachedResponse &&
				cachedResponse.content === message &&
				Date.now() - cachedResponse.timestamp < this.CACHE_TTL
			) {
				this.logger.debug(`Cached response for interaction ${interaction.id}`);
				return;
			}

			let response;
			if (interaction.replied || interaction.deferred) {
				this.logger.debug(
					bot.locale.t("commands.interaction.editing_reply", {
						id: interaction.id,
					}),
				);
				response = await interaction.editReply({ content: message });
			} else {
				this.logger.debug(
					bot.locale.t("commands.interaction.sending_reply", {
						id: interaction.id,
					}),
				);
				response = await interaction.reply({
					content: message,
					flags: MessageFlags.Ephemeral,
				});
			}

			// Кэшируем ответ
			this.interactionCache.set(cacheKey, {
				content: message,
				timestamp: Date.now(),
			});

			// Устанавливаем TTL для кэша
			setTimeout(() => {
				this.interactionCache.delete(cacheKey);
			}, this.CACHE_TTL);

			return response;
		} catch (error: unknown) {
			this.handleInteractionError(error, interaction);
		}
	}

	/**
	 * Удаляет сообщение Discord
	 */
	public async delete(message: Message): Promise<void> {
		if (!message.deletable) {
			this.logger.debug(
				bot.locale.t("commands.message.not_deletable", { id: message.id }),
			);
			return;
		}

		try {
			await message.delete();
			this.logger.debug(
				bot.locale.t("commands.message.deleted", { id: message.id }),
			);
		} catch (error) {
			this.handleMessageError(error, message);
		}
	}

	/**
	 * Отвечает на взаимодействие команды
	 */
	public async reply(
		interaction: CommandInteraction,
		content: string,
	): Promise<void> {
		if (!interaction.isRepliable()) {
			this.logger.debug(
				bot.locale.t("commands.interaction.not_repliable", {
					id: interaction.id,
				}),
			);
			return;
		}

		try {
			// Проверяем кэш для предотвращения дублирования сообщений
			const cacheKey = `${interaction.id}-${interaction.user.id}`;
			const cachedResponse = this.interactionCache.get(cacheKey);

			if (
				cachedResponse &&
				cachedResponse.content === content &&
				Date.now() - cachedResponse.timestamp < this.CACHE_TTL
			) {
				this.logger.debug(`Cached response for interaction ${interaction.id}`);
				return;
			}

			if (!interaction.deferred && !interaction.replied) {
				await interaction.deferReply({
					flags: MessageFlags.Ephemeral,
				});
			}

			await interaction.editReply({ content });

			// Кэшируем ответ
			this.interactionCache.set(cacheKey, {
				content,
				timestamp: Date.now(),
			});

			// Устанавливаем TTL для кэша
			setTimeout(() => {
				this.interactionCache.delete(cacheKey);
			}, this.CACHE_TTL);
		} catch (error) {
			if (error instanceof DiscordAPIError) {
				if (error.code === 40060) {
					this.logger.debug(
						bot.locale.t("commands.interaction.already_acknowledged", {
							id: interaction.id,
						}),
					);
				} else {
					this.logger.error(
						bot.locale.t("errors.discord_api", {
							code: error.code,
							message: error.message,
						}),
					);
				}
			}
		}
	}

	/**
	 * Обрабатывает ошибки API Discord для взаимодействий
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
				bot.locale.t("commands.interaction.unknown_error", {
					id: interaction.id,
				}),
				error,
			);
		}
	}

	/**
	 * Обрабатывает ошибки API Discord для сообщений
	 */
	private handleMessageError(error: unknown, message: Message): void {
		if (error instanceof DiscordAPIError) {
			this.handleDiscordAPIError(error, `message with ID: ${message.id}`);
		} else {
			this.logger.error(
				bot.locale.t("commands.message.unknown_error", { id: message.id }),
				error,
			);
		}
	}

	/**
	 * Обрабатывает определенные коды ошибок API Discord
	 */
	private handleDiscordAPIError(error: DiscordAPIError, context: string): void {
		const errorCode = Number(error.code);
		const isExpiredInteraction = [10008, 10062].includes(errorCode);

		if (isExpiredInteraction) {
			this.logger.debug(
				bot.locale.t("commands.interaction.expired", { context }),
			);
		} else {
			this.logger.error(
				bot.locale.t("errors.discord_api", {
					code: errorCode,
					context,
					message: error.message,
				}),
			);
		}
	}

	/**
	 * Очищает кэш взаимодействий
	 */
	public clearCache(): void {
		this.interactionCache.clear();
		this.logger.debug("Interaction cache cleared");
	}
}
