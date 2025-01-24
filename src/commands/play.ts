import {
	ApplicationCommandOptionType,
	type AutocompleteInteraction,
	type CommandInteraction,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { bot } from "../bot.js";
import logger from "../utils/logger.js";

interface Track {
	id: string;
	title: string;
	artists: { name: string }[];
	source: string;
	albums?: { title?: string }[];
}

@Discord()
export class PlayCommand {
	private static readonly MAX_RESULTS = 25;
	private static readonly MAX_TITLE_LENGTH = 50;
	private static readonly MIN_QUERY_LENGTH = 2;
	private static readonly MAX_CHOICE_LENGTH = 100;

	@Slash({ description: `Play track`, name: "play" })
	async play(
		@SlashOption({
			description: `Track name or URL`,
			name: "track",
			required: false,
			type: ApplicationCommandOptionType.String,
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

		interaction.isAutocomplete()
			? await this.handleAutocomplete(interaction, query)
			: await this.handlePlay(interaction as CommandInteraction, query);
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
			await bot.commandService.reply(interaction, bot.messages.PROVIDE_TRACK);
			return;
		}

		await bot.commandService.reply(interaction, bot.messages.STARTED_PLAYING);
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
				await interaction.respond([]);
				return;
			}

			const results = await bot.nameService.searchName(query);
			const choices = this.processAutocompleteResults(results, query);

			await interaction.respond(
				choices.map((choice) => ({
					name: choice.name,
					value: this.truncateString(
						choice.value,
						PlayCommand.MAX_CHOICE_LENGTH,
					),
				})),
			);
		} catch (error) {
			logger.error(
				`${bot.loggerMessages.ERROR_AUTOCOMPLETE}: ${error instanceof Error ? error.message : String(error)}`,
			);
			await interaction.respond([]);
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
		return results
			.slice(0, PlayCommand.MAX_RESULTS)
			.map((track) => ({
				...this.createAutocompleteChoice(track),
				relevance: this.calculateRelevance(track, query),
			}))
			.filter((choice) => choice.relevance > 0)
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
		const artistMatch = track.artists.some((artist) =>
			artist.name.toLowerCase().includes(lowercaseQuery),
		);
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
			const results = await bot.nameService.searchName(query);
			if (!results.length) {
				await bot.commandService.reply(
					interaction,
					bot.messages.NO_TRACKS_FOUND(query),
				);
				return;
			}

			await bot.nameService.trackAndUrl(query, results, interaction);
		} catch (error) {
			logger.error(
				`${bot.loggerMessages.ERROR_PLAYING_TRACK}: ${error instanceof Error ? error.message : String(error)}`,
			);
			await bot.commandService.reply(interaction, bot.messages.PLAY_ERROR);
		}
	}

	/**
	 * Formats a track name for display
	 * @param {Track} track - Track information
	 * @returns {string} Formatted track name
	 */
	private formatTrackName(track: Track): string {
		return `${track.artists.map((a) => a.name).join(", ")} - ${this.truncateString(
			track.title,
			PlayCommand.MAX_TITLE_LENGTH,
		)}`;
	}
}
