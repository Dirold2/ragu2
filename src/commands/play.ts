import {
	ApplicationCommandOptionType,
	type AutocompleteInteraction,
	type CommandInteraction,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { bot } from "../bot.js";

interface Track {
	id: string;
	title: string;
	artists?: { name: string }[];
	source: string;
	albums?: { title?: string }[];
}

@Discord()
export class PlayCommand {
	private static readonly MAX_RESULTS = 25;
	private static readonly MAX_TITLE_LENGTH = 50;
	private static readonly MIN_QUERY_LENGTH = 2;
	private static readonly MAX_CHOICE_LENGTH = 100;

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
		const query = trackName?.trim();

		if (!query) {
			await this.handleEmptyQuery(interaction);
			return;
		}

		if (interaction.isAutocomplete()) {
			await this.handleAutocomplete(interaction, query);
		} else {
			await this.handlePlay(interaction as CommandInteraction, query);
		}
	}

	/**
	 * Handles an empty query
	 * @param {CommandInteraction | AutocompleteInteraction} interaction - Discord command interaction
	 */
	private async handleEmptyQuery(
		interaction: CommandInteraction | AutocompleteInteraction,
	): Promise<void> {
		if (!interaction.isChatInputCommand()) return;

		const player = bot.playerManager.getPlayer(interaction.guildId!);
		await player.initialize("currentTrack");

		if (!player.state.currentTrack?.info) {
			if (!interaction.replied && !interaction.deferred) {
				await bot.commandService.reply(
					interaction,
					"commands.play.player.status.nothing_playing",
				);
			}
			return;
		}

		if (!interaction.replied && !interaction.deferred) {
			await bot.commandService.reply(
				interaction,
				"commands.play.started_playing",
				{
					track: player.state.currentTrack?.info,
				},
			);
		}
		await bot.playerManager.joinChannel(interaction);
	}

	/**
	 * Handles autocomplete interactions
	 * @param {AutocompleteInteraction} interaction - Discord autocomplete interaction
	 * @param {string} query - Query string
	 */
	private async handleAutocomplete(
		interaction: AutocompleteInteraction,
		query: string,
	): Promise<void> {
		try {
			if (query.length < PlayCommand.MIN_QUERY_LENGTH) {
				if (!interaction.responded) {
					await interaction.respond([]);
				}
				return;
			}
			const results = await bot.nameService.searchName(query);
			const choices = this.processAutocompleteResults(
				results as unknown as Track[],
				query,
			);

			if (!interaction.responded) {
				await interaction.respond(
					choices.map((choice) => ({
						name: choice.name,
						value: this.truncateString(
							choice.value,
							PlayCommand.MAX_CHOICE_LENGTH,
						),
					})),
				);
			}
		} catch (error) {
			bot.logger.error(
				bot.locale.t(
					"commands.play.searching",
					{ query },
					interaction.guild?.preferredLocale || "en",
				),
				error,
			);
			if (!interaction.responded) {
				await interaction.respond([]);
			}
		}
	}

	/**
	 * Processes autocomplete results
	 * @param {Track[]} results - Search results
	 * @param {string} query - Query string
	 * @returns {Object[]} Processed autocomplete choices
	 */
	private processAutocompleteResults(
		results: Track[],
		query: string,
	): { name: string; value: string }[] {
		if (!Array.isArray(results)) {
			bot.logger.warn(bot.locale.t("commands.play.errors.invalid"));
			return [];
		}

		return results
			.slice(0, PlayCommand.MAX_RESULTS)
			.map((track) => {
				try {
					return {
						...this.createAutocompleteChoice(track),
						relevance: this.calculateRelevance(track, query),
					};
				} catch (error) {
					bot.logger.warn(
						bot.locale.t("commands.play.errors.processing", {
							error: error instanceof Error ? error.message : String(error),
						}),
					);
					return null;
				}
			})
			.filter(
				(choice): choice is NonNullable<typeof choice> =>
					choice !== null && choice.relevance > 0,
			)
			.sort((a, b) => b.relevance - a.relevance)
			.map(({ name, value }) => ({ name, value }));
	}

	/**
	 * Calculates relevance of a track based on the query
	 * @param {Track} track - Track information
	 * @param {string} query - Query string
	 * @returns {number} Relevance score
	 */
	private calculateRelevance(track: Track, query: string): number {
		const lowercaseQuery = query.toLowerCase();
		const artistMatch =
			track.artists?.some((artist) =>
				artist.name.toLowerCase().includes(lowercaseQuery),
			) ?? false;
		const titleMatch = track.title.toLowerCase().includes(lowercaseQuery);
		return (artistMatch ? 2 : 0) + (titleMatch ? 1 : 0);
	}

	/**
	 * Creates an autocomplete choice for a track
	 * @param {Track} track - Track information
	 * @returns {Object} Autocomplete choice
	 */
	private createAutocompleteChoice(track: Track): {
		name: string;
		value: string;
	} {
		const name = this.formatTrackName(track);
		return {
			name: this.truncateString(name, PlayCommand.MAX_CHOICE_LENGTH),
			value: name,
		};
	}

	/**
	 * Truncates a string to a maximum length
	 * @param {string} str - Input string
	 * @param {number} maxLength - Maximum length
	 * @returns {string} Truncated string
	 */
	private truncateString(str: string, maxLength: number): string {
		return str.length > maxLength ? `${str.slice(0, maxLength - 3)}...` : str;
	}

	/**
	 * Handles the play command
	 * @param {CommandInteraction} interaction - Discord command interaction
	 * @param {string} query - Query string
	 */
	private async handlePlay(
		interaction: CommandInteraction,
		query: string,
	): Promise<void> {
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
			bot.logger.error(
				bot.locale.t("commands.play.errors.processing", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);

			if (interaction.deferred) {
				await interaction.editReply(
					bot.locale.t(
						"commands.play.errors.processing",
						undefined,
						interaction.guild?.preferredLocale || "en",
					),
				);
			}
		}
	}

	/**
	 * Formats a track name for display
	 * @param {Track} track - Track information
	 * @returns {string} Formatted track name
	 */
	private formatTrackName(track: Track): string {
		const artists =
			track.artists?.map((a) => a.name).join(", ") || "Unknown Artist";
		const title = this.truncateString(
			track.title || "Unknown Title",
			PlayCommand.MAX_TITLE_LENGTH,
		);
		return `${artists} - ${title}`;
	}
}
