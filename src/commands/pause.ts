import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";

@Discord()
export class PauseCommand {
  @Slash({
    name: "pause",
    description: t("commands.pause.description"),
  })
  async pause(interaction: CommandInteraction): Promise<void> {
    const { commandService, playerControl } = getDeps();
    const result = await playerControl.togglePause(interaction.guildId ?? "");

    if (!result.ok) {
      await commandService.reply(interaction, "commands.pause.errors.not_found");
      return;
    }

    await commandService.reply(
      interaction,
      result.data.paused ? "commands.pause.paused" : "commands.pause.resumed",
    );
  }
}
