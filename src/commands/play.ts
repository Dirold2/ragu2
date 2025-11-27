import {
	ApplicationCommandOptionType,
	type AutocompleteInteraction,
	type CommandInteraction,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { bot } from "../bot.js";

@Discord()
export class PlayCommand {
	private static readonly MAX_RESULTS = 25;
	private static readonly MAX_TITLE_LENGTH = 50;
	private static readonly MIN_QUERY_LENGTH = 2;
	private static readonly MAX_CHOICE_LENGTH = 100;
	private static readonly AUTOCOMPLETE_TIMEOUT = 2500;

	@Slash({
		name: "play",
		description: bot.locale.t("commands.play.description"),
	})
	async play(
		@SlashOption({
			name: "track",
			description: bot.locale.t("commands.play.option_track"),
			type: ApplicationCommandOptionType.String,
			required: false,
			autocomplete: true,
		})
		trackName: string | undefined,
		interaction: CommandInteraction | AutocompleteInteraction,
	): Promise<void> {
		if (interaction.isAutocomplete()) {
			await this.handleAutocomplete(interaction, trackName?.trim());
			return;
		}

		if (interaction.isChatInputCommand()) {
			await this.handleCommand(interaction, trackName?.trim());
		}
	}

	private async handleAutocomplete(
		interaction: AutocompleteInteraction,
		query: string | undefined,
	): Promise<void> {
		// Ранний выход для коротких запросов
		if (!query || query.length < PlayCommand.MIN_QUERY_LENGTH) {
			await this.safeRespond(interaction, []);
			return;
		}

		// Проверка таймаута перед началом
		if (
			Date.now() - interaction.createdTimestamp >=
			PlayCommand.AUTOCOMPLETE_TIMEOUT
		) {
			await this.safeRespond(interaction, []);
			return;
		}

		try {
			const results = await bot.nameService.searchName(query);
			const choices = this.buildAutocompleteChoices(results, query);

			await this.safeRespond(interaction, choices);
		} catch (error) {
			bot.logger.error(`Autocomplete failed for "${query}":`, error);
			await this.safeRespond(interaction, []);
		}
	}

	private async handleCommand(
		interaction: CommandInteraction,
		query: string | undefined,
	): Promise<void> {
		// Случай без запроса - воспроизведение текущего трека
		if (!query) {
			await this.handleEmptyQuery(interaction);
			return;
		}

		try {
			await bot.commandService.reply(interaction, "commands.play.searching", {
				query,
			});

			const results = await bot.nameService.searchName(query);

			if (!results.length) {
				await interaction.editReply(
					bot.locale.t(
						"commands.play.errors.search",
						{ query },
						interaction.guild?.preferredLocale || "en",
					),
				);
				return;
			}

			await bot.nameService.trackAndUrl(query, results, interaction);
		} catch (error) {
			await this.handleCommandError(interaction, error);
		}
	}

	private async handleEmptyQuery(
		interaction: CommandInteraction,
	): Promise<void> {
		const player = bot.playerManager.getPlayer(interaction.guildId!);

		if (!player.state.currentTrack?.info) {
			await bot.commandService.reply(
				interaction,
				"commands.play.player.status.nothing_playing",
			);
			return;
		}

		await bot.commandService.reply(
			interaction,
			"commands.play.started_playing",
			{ track: player.state.currentTrack.info },
		);

		await bot.playerManager.joinChannel(interaction);
	}

	private buildAutocompleteChoices(
		results: Array<{
			title: string;
			artists?: Array<{ name: string }>;
		}>,
		query: string,
	) {
		const lowercaseQuery = query.toLowerCase();

		return results
			.slice(0, PlayCommand.MAX_RESULTS)
			.map((track) => this.formatTrackChoice(track, lowercaseQuery))
			.filter(
				(choice): choice is NonNullable<typeof choice> =>
					choice !== null && choice.relevance > 0,
			)
			.sort((a, b) => b.relevance - a.relevance)
			.map(({ name, value }) => ({
				name: this.truncate(name, PlayCommand.MAX_CHOICE_LENGTH),
				value: this.truncate(value, PlayCommand.MAX_CHOICE_LENGTH),
			}));
	}

	private formatTrackChoice(
		track: { title: string; artists?: Array<{ name: string }> },
		lowercaseQuery: string,
	) {
		try {
			const artists =
				track.artists?.map((a) => a.name).join(", ") || "Unknown Artist";
			const title = this.truncate(
				track.title || "Unknown Title",
				PlayCommand.MAX_TITLE_LENGTH,
			);

			const artistMatch =
				track.artists?.some((artist) =>
					artist.name.toLowerCase().includes(lowercaseQuery),
				) ?? false;
			const titleMatch = track.title.toLowerCase().includes(lowercaseQuery);

			const displayText = `${artists} - ${title}`;
			const relevance = (artistMatch ? 2 : 0) + (titleMatch ? 1 : 0);

			return { name: displayText, value: displayText, relevance };
		} catch (error) {
			bot.logger.warn(
				bot.locale.t("commands.play.errors.processing", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return null;
		}
	}

	private async handleCommandError(
		interaction: CommandInteraction,
		error: unknown,
	): Promise<void> {
		bot.logger.error(
			bot.locale.t("commands.play.errors.processing", {
				error: error instanceof Error ? error.message : String(error),
			}),
		);

		if (interaction.deferred || interaction.replied) {
			await interaction
				.editReply(
					bot.locale.t(
						"commands.play.errors.processing",
						undefined,
						interaction.guild?.preferredLocale || "en",
					),
				)
				.catch(() => {});
		}
	}

	private async safeRespond(
		interaction: AutocompleteInteraction,
		choices: Array<{ name: string; value: string }>,
	): Promise<void> {
		if (interaction.responded) return;

		try {
			await interaction.respond(choices);
		} catch (error) {
			// Игнорируем ошибки ответа (таймаут/уже отвечено)
		}
	}

	private truncate(text: string, maxLength: number): string {
		return text.length > maxLength
			? `${text.slice(0, maxLength - 3)}...`
			: text;
	}
}
