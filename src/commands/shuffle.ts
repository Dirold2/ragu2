import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";

@Discord()
export class ShuffleCommand {
  @Slash({
    name: "shuffle",
    description: t("commands.shuffle.description"),
  })
  async toggleShuffle(interaction: CommandInteraction): Promise<void> {
    const { commandService, playerControl } = getDeps();
    const guildId = interaction.guildId;
    if (!guildId) {
      await commandService.reply(interaction, "commands.shuffle.errors.guild_only");
      return;
    }

    const result = await playerControl.shuffle(guildId);
    if (!result.ok) {
      await commandService.reply(
        interaction,
        result.code === "PLAYER_NOT_FOUND"
          ? "commands.shuffle.errors.no_player"
          : "commands.shuffle.errors.not_enough_tracks",
      );
      return;
    }

    await commandService.reply(interaction, "commands.shuffle.success", {
      count: result.data.count,
    });
  }
}
