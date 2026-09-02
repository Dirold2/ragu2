import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  type CommandInteraction,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { getDeps, t } from "./commandDeps.js";
import { getErrorMessage } from "../utils/error.js";

@Discord()
export class PlayCommand {
  private static readonly MAX_RESULTS = 25;
  private static readonly MAX_TITLE_LENGTH = 50;
  private static readonly MIN_QUERY_LENGTH = 2;
  private static readonly MAX_CHOICE_LENGTH = 100;
  private static readonly AUTOCOMPLETE_TIMEOUT = 2500;

  @Slash({
    name: "play",
    description: t("commands.play.description"),
  })
  async play(
    @SlashOption({
      name: "track",
      description: t("commands.play.option_track"),
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
    if (Date.now() - interaction.createdTimestamp >= PlayCommand.AUTOCOMPLETE_TIMEOUT) {
      await this.safeRespond(interaction, []);
      return;
    }

    const { nameService, logger } = getDeps();
    try {
      const results = await nameService.searchName(query);
      const choices = this.buildAutocompleteChoices(results, query);

      await this.safeRespond(interaction, choices);
    } catch (error) {
      logger.error(`Autocomplete failed for "${query}": ${getErrorMessage(error)}`);
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

    const { commandService, nameService, logger } = getDeps();
    try {
      await commandService.reply(interaction, "commands.play.searching", {
        query,
      });

      const selection = this.parseAutocompleteSelection(query);
      const searchQuery = selection?.query ?? query;
      const results = await nameService.searchName(searchQuery);

      const filteredResults = selection
        ? results.filter((result) => result.source === selection.source)
        : results;

      if (!filteredResults.length) {
        await interaction.editReply(
          t("commands.play.errors.search", { query: searchQuery }, interaction.guild?.preferredLocale || "en"),
        );
        return;
      }

      await nameService.trackAndUrl(searchQuery, filteredResults, interaction);
    } catch (error) {
      await this.handleCommandError(interaction, error, logger);
    }
  }

  private async handleEmptyQuery(interaction: CommandInteraction): Promise<void> {
    const { playerManager, commandService } = getDeps();
    const player = playerManager.getPlayer(interaction.guildId!);

    if (!player.state.currentTrack?.info) {
      await commandService.reply(interaction, "commands.play.player.status.nothing_playing");
      return;
    }

    await commandService.reply(interaction, "commands.play.started_playing", {
      track: player.state.currentTrack.info,
    });

    await playerManager.joinChannel(interaction);
  }

  private buildAutocompleteChoices(
    results: Array<{
      id: string;
      title: string;
      source: string;
      artists?: Array<{ name: string }>;
    }>,
    query: string,
  ) {
    const lowercaseQuery = query.toLowerCase();

    return results
      .slice(0, PlayCommand.MAX_RESULTS)
      .map((track) => this.formatTrackChoice(track, lowercaseQuery))
      .filter(
        (choice): choice is NonNullable<typeof choice> => choice !== null && choice.relevance > 0,
      )
      .sort((a, b) => b.relevance - a.relevance)
      .map(({ name, value }) => ({
        name: this.truncate(name, PlayCommand.MAX_CHOICE_LENGTH),
        value: value,
      }));
  }

  private parseAutocompleteSelection(
    value: string,
  ): { source: string; query: string } | null {
    const match = /^__ragu__:(?<source>[^:]+):(?<query>.+)$/u.exec(value);
    if (!match?.groups) return null;

    return { source: match.groups.source, query: match.groups.query };
  }

  private formatTrackChoice(
    track: { id: string; title: string; source: string; artists?: Array<{ name: string }> },
    lowercaseQuery: string,
  ) {
    try {
      const artists = track.artists?.map((a) => a.name).join(", ") || "Unknown Artist";
      const title = this.truncate(track.title || "Unknown Title", PlayCommand.MAX_TITLE_LENGTH);

      const artistMatch =
        track.artists?.some((artist) => artist.name.toLowerCase().includes(lowercaseQuery)) ??
        false;
      const titleMatch = track.title.toLowerCase().includes(lowercaseQuery);

      const displayText = `${artists} - ${title}`;
      const autocompletePrefix = `__ragu__:${track.source}:`;
      const value = `${autocompletePrefix}${this.truncate(
        displayText,
        PlayCommand.MAX_CHOICE_LENGTH - autocompletePrefix.length,
      )}`;
      const relevance = (artistMatch ? 2 : 0) + (titleMatch ? 1 : 0);

      return { name: displayText, value, relevance };
    } catch (error) {
      const { logger } = getDeps();
      logger.warn(
        t("commands.play.errors.processing", {
          error: getErrorMessage(error),
        }),
      );
      return null;
    }
  }

  private async handleCommandError(
    interaction: CommandInteraction,
    error: unknown,
    logger?: import("dlog2").Logger,
  ): Promise<void> {
    logger?.error(
      t("commands.play.errors.processing", {
        error: getErrorMessage(error),
      }),
    );

    if (interaction.deferred || interaction.replied) {
      await interaction
        .editReply(
          t(
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
    } catch {
      // Игнорируем ошибки ответа (таймаут/уже отвечено)
    }
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
  }
}
