import {
  ApplicationCommandOptionType,
  AutocompleteInteraction,
  CommandInteraction,
  MessageFlags,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";

import { getDeps, t } from "./commandDeps.js";

const MAX_AUTOCOMPLETE_CHOICES = 25;
const MAX_CHOICE_NAME_LENGTH = 100;

@Discord()
export class SkipCommand {
  @Slash({
    name: "skip",
    description: t("commands.skip.description"),
  })
  async skip(
    @SlashOption({
      name: "track",
      description: t("commands.skip.option_track"),
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

    const { commandService, playerControl } = getDeps();
    const guildId = interaction.guildId;
    if (!guildId) {
      await commandService.reply(interaction, "commands.skip.errors.guild_only");
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await playerControl.skip(guildId, queueEntryId);
    if (!result.ok) {
      await commandService.reply(
        interaction,
        result.code === "QUEUE_ENTRY_NOT_FOUND"
          ? "commands.skip.errors.target_not_found"
          : "commands.skip.errors.not_found",
      );
      return;
    }

    if (result.data.target) {
      await commandService.reply(interaction, "commands.skip.skipped_to", {
        track: result.data.target.info,
      });
      return;
    }

    await commandService.reply(interaction, "commands.skip.skipped");
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
      .map((entry, index) => ({ entry, index }))
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
