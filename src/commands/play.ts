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

	constructor() {
		this.play = this.play.bind(this);
	}

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
			return;
		}

		if (interaction.isAutocomplete()) {
			try {
				if (query.length < PlayCommand.MIN_QUERY_LENGTH) {
					if (!interaction.responded) {
						await interaction.respond([]).catch(() => {});
					}
				}

				const results = await bot.nameService.searchName(query);

				const choices = results
					.slice(0, PlayCommand.MAX_RESULTS)
					.map((track) => {
						const artists =
							track.artists?.map((a) => a.name).join(", ") || "Unknown Artist";
						const rawTitle = track.title || "Unknown Title";
						const title =
							rawTitle.length > PlayCommand.MAX_TITLE_LENGTH
								? `${rawTitle.slice(0, PlayCommand.MAX_TITLE_LENGTH - 3)}...`
								: rawTitle;

						const lowercaseQuery = query.toLowerCase();
						const artistMatch =
							track.artists?.some((artist) =>
								artist.name.toLowerCase().includes(lowercaseQuery),
							) ?? false;
						const titleMatch = track.title
							.toLowerCase()
							.includes(lowercaseQuery);

						try {
							return {
								name:
									`${artists} - ${title}`.length > PlayCommand.MAX_CHOICE_LENGTH
										? `${`${artists} - ${title}`.slice(0, PlayCommand.MAX_CHOICE_LENGTH - 3)}...`
										: `${artists} - ${title}`,
								value: `${artists} - ${title}`,
								relevance: (artistMatch ? 2 : 0) + (titleMatch ? 1 : 0),
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

				if (
					!interaction.responded &&
					Date.now() - interaction.createdTimestamp < 3000
				) {
					await interaction.respond(
						choices.map((choice) => ({
							name: choice.name,
							value:
								choice.value.length > PlayCommand.MAX_CHOICE_LENGTH
									? `${choice.value.slice(0, PlayCommand.MAX_CHOICE_LENGTH - 3)}...`
									: choice.value,
						})),
					);
				}
			} catch (error) {
				if (!interaction.responded) {
					interaction.respond([]).catch(() => {});
				}
				bot.logger.error(`Autocomplete failed for "${query}":`, error);
			}
		} else {
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
	}
}
