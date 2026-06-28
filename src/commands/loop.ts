import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";

@Discord()
export class LoopCommand {
  @Slash({
    name: "loop",
    description: t("commands.loop.description"),
  })
  async toggleLoop(interaction: CommandInteraction) {
    const { playerManager, commandService, logger } = getDeps();
    try {
      const player = playerManager.getPlayer(interaction.guildId!);
      if (!player) {
        return await commandService.reply(interaction, "commands.loop.errors.not_found");
      }

      player.state.loop = !player.state.loop;

      await playerManager.setLoop(interaction.guildId!, player.state.loop);

      return await commandService.reply(
        interaction,
        player.state.loop ? "commands.loop.enabled" : "commands.loop.disabled",
        player.state.loop ? { track: player.state.currentTrack?.info || "" } : undefined,
      );
    } catch (error) {
      logger.error(
        getDeps().t("commands.loop.errors.playback", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return await commandService.reply(interaction, "commands.loop.errors.playback", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
