import {
	CommandInteraction,
	DiscordAPIError,
	type Message,
	MessageFlags,
} from "discord.js";
import { bot } from "../bot.js";
import { DotPaths, TranslationParams } from "../utils/locale.js";
import translations from "../locales/en.json" with { type: "json" };

export default class CommandService {
	private readonly logger = bot.logger;
	private readonly interactionCache = new Map<
		string,
		{ content: string; timestamp: number }
	>();
	private readonly CACHE_TTL = 60000;
	private readonly timeoutHandles = new Map<string, NodeJS.Timeout>();

	/**
	 * Получает язык сервера или значение по умолчанию
	 */
	private getGuildLanguage(interaction: CommandInteraction): string {
		return interaction.guild?.preferredLocale || "en";
	}

	/**
	 * Упрощённый ответ с автоматическим переводом
	 */
	public async reply(
		interaction: CommandInteraction,
		translationKey: DotPaths<typeof translations>,
		params?: TranslationParams,
		options: {
			ephemeral?: boolean;
			forceFresh?: boolean;
		} = { ephemeral: true },
	): Promise<void> {
		if (!interaction.isRepliable()) {
			this.logger.debug(
				bot.locale.t(
					"messages.commandServise.interaction.not_repliable",
					{
						id: interaction.id,
					},
					this.getGuildLanguage(interaction),
				),
			);
			return;
		}

		const lang = this.getGuildLanguage(interaction);

		await bot.locale.load(lang);
		bot.locale.setLanguageMessage(lang);

		const content = bot.locale.t(translationKey, params, `${lang}`);

		try {
			// Проверка кэша
			const cacheKey = `${interaction.id}-${interaction.user.id}`;
			const cachedResponse = this.interactionCache.get(cacheKey);

			if (
				!options.forceFresh &&
				cachedResponse?.content === content &&
				Date.now() - cachedResponse.timestamp < this.CACHE_TTL
			) {
				this.logger.debug(`Cached response for interaction ${interaction.id}`);
				return;
			}

			// Отправка сообщения
			if (!interaction.deferred && !interaction.replied) {
				await interaction.deferReply({
					flags: options.ephemeral ? MessageFlags.Ephemeral : undefined,
				});
			}

			try {
				await interaction.editReply({ content });
			} catch (err) {
				// Fallback: if the original reply cannot be edited (expired/already acknowledged), send follow-up
				if (err instanceof DiscordAPIError && [10008, 10062, 40060].includes(Number(err.code))) {
					try {
						await interaction.followUp({
							content,
							flags: options.ephemeral ? MessageFlags.Ephemeral : undefined,
						});
					} catch (followErr) {
						this.handleError(followErr, interaction);
					}
				} else {
					throw err;
				}
			}

			// Обновление кэша
			this.interactionCache.set(cacheKey, { content, timestamp: Date.now() });
			const timeoutId = setTimeout(() => {
				this.interactionCache.delete(cacheKey);
				this.timeoutHandles.delete(cacheKey);
			}, this.CACHE_TTL);
			this.timeoutHandles.set(cacheKey, timeoutId);
		} catch (error) {
			this.handleError(error, interaction);
		}
	}

	/**
	 * Удаление сообщения с логированием
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
			this.handleError(error, message);
		}
	}

	/**
	 * Унифицированная обработка ошибок
	 */
	private handleError(
		error: unknown,
		context: CommandInteraction | Message,
	): void {
		const lang =
			context instanceof CommandInteraction
				? this.getGuildLanguage(context)
				: "en";

		if (error instanceof DiscordAPIError) {
			const contextId = "id" in context ? context.id : "unknown";
			const errorContext =
				"id" in context
					? `message with ID: ${contextId}`
					: `interaction with ID: ${contextId}`;

			if ([10008, 10062].includes(Number(error.code))) {
				this.logger.debug(
					bot.locale.t(
						"messages.commandServise.interaction.expired",
						{ context: errorContext },
						lang,
					),
				);
			} else if (error.code === 40060) {
				this.logger.debug(
					bot.locale.t(
						"messages.commandServise.interaction.already_acknowledged",
						{ id: context.id },
						lang,
					),
				);
			} else {
				this.logger.error(
					bot.locale.t(
						"messages.commandServise.errors.discord_api",
						{
							code: error.code,
							context: errorContext,
							message: error.message,
						},
						lang,
					),
				);
			}
		} else {
			this.logger.error(
				bot.locale.t(
					"commands.message.unknown_error",
					{ id: "id" in context ? context.id : "unknown" },
					lang,
				),
				error,
			);
		}
	}

	public clearCache(): void {
		for (const handle of this.timeoutHandles.values()) {
			clearTimeout(handle);
		}
		this.timeoutHandles.clear();
		this.interactionCache.clear();
		this.logger.debug("Interaction cache and timers cleared");
	}
}
