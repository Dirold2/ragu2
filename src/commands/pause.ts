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
    const { playerManager, commandService } = getDeps();
    const player = playerManager.getPlayer(interaction.guildId!);
    if (!player) {
      return await commandService.reply(interaction, "commands.pause.errors.not_found");
    }

    await playerManager.togglePause(interaction);

    return await commandService.reply(
      interaction,
      player.state.pause ? "commands.pause.paused" : "commands.pause.resumed",
      undefined,
    );
  }
}
