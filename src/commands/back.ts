import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";

@Discord()
export class BackCommand {
  @Slash({
    name: "back",
    description: t("commands.back.description"),
  })
  async back(interaction: CommandInteraction): Promise<void> {
    const { commandService, playerControl } = getDeps();
    const guildId = interaction.guildId;
    if (!guildId) {
      await commandService.reply(interaction, "commands.back.errors.guild_only");
      return;
    }

    const result = await playerControl.back(guildId);

    if (!result.ok) {
      await commandService.reply(interaction, "commands.back.errors.not_found");
      return;
    }

    await commandService.reply(interaction, "commands.back.success", {
      track: result.data.track.info,
    });
  }
}
