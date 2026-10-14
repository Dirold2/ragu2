import {
  ApplicationCommandOptionType,
  AutocompleteInteraction,
  CommandInteraction,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";

import { getDeps, t } from "./commandDeps.js";
import { getErrorMessage } from "../utils/error.js";

const MAX_AUTOCOMPLETE_CHOICES = 25;
const MAX_CHOICE_NAME_LENGTH = 100;

@Discord()
export class DeleteCommand {
  @Slash({
    name: "delete",
    description: t("commands.delete.description"),
  })
  async delete(
    @SlashOption({
      name: "track",
      description: t("commands.delete.option_track"),
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: true,
    })
    queueEntryId: string | undefined,
    interaction: CommandInteraction | AutocompleteInteraction,
  ): Promise<void> {
    if (interaction.isAutocomplete()) {
      await this.handleAutocomplete(interaction, queueEntryId);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandService, logger, queueService } = getDeps();
    const guildId = interaction.guildId;
    if (!guildId) {
      await commandService.reply(interaction, "commands.delete.errors.guild_only");
      return;
    }

    try {
      const entryId = queueEntryId ?? queueService.getQueueEntries(guildId).at(-1)?.id;
      if (!entryId) {
        await commandService.reply(interaction, "commands.delete.errors.empty");
        return;
      }

      const removedTrack = await queueService.removeQueueEntry(guildId, entryId);
      if (!removedTrack) {
        await commandService.reply(interaction, "commands.delete.errors.not_found");
        return;
      }

      await commandService.reply(interaction, "commands.delete.success", {
        track: removedTrack.info,
      });
    } catch (error) {
      logger.error(`Failed to delete queued track: ${getErrorMessage(error)}`);
      await commandService.reply(interaction, "commands.delete.errors.unexpected", {
        error: getErrorMessage(error),
      });
    }
  }

  private async handleAutocomplete(
    interaction: AutocompleteInteraction,
    query: string | undefined,
  ): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.respond([]);
      return;
    }

    const normalizedQuery = query?.trim().toLocaleLowerCase() ?? "";
    const choices = getDeps()
      .queueService.getQueueEntries(guildId)
      .map((entry, index) => ({
        entry,
        index,
      }))
      .filter(({ entry }) => entry.track.info.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, MAX_AUTOCOMPLETE_CHOICES)
      .map(({ entry, index }) => ({
        name: this.formatChoice(index + 1, entry.track.info),
        value: entry.id,
      }));

    await interaction.respond(choices);
  }

  private formatChoice(position: number, trackInfo: string): string {
    const label = `#${position} ${trackInfo}`;
    return label.length <= MAX_CHOICE_NAME_LENGTH
      ? label
      : `${label.slice(0, MAX_CHOICE_NAME_LENGTH - 1)}…`;
  }
}
