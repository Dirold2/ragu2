import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";

@Discord()
export class LoopCommand {
  @Slash({
    name: "loop",
    description: t("commands.loop.description"),
  })
  async toggleLoop(interaction: CommandInteraction): Promise<void> {
    const { commandService, playerControl } = getDeps();
    const result = await playerControl.toggleLoop(interaction.guildId ?? "");

    if (!result.ok) {
      await commandService.reply(interaction, "commands.loop.errors.not_found");
      return;
    }

    const state = await playerControl.getState(interaction.guildId ?? "");
    await commandService.reply(
      interaction,
      result.data.enabled ? "commands.loop.enabled" : "commands.loop.disabled",
      result.data.enabled
        ? { track: state.ok ? state.data.player?.currentTrack?.info || "" : "" }
        : undefined,
    );
  }
}
