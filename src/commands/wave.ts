import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";

@Discord()
export class WaveCommand {
  @Slash({
    name: "wave",
    description: t("commands.wave.description"),
  })
  async toggleWave(interaction: CommandInteraction) {
    const { playerManager, commandService, logger } = getDeps();
    try {
      const player = playerManager.getPlayer(interaction.guildId!);
      if (!player) {
        return await commandService.reply(interaction, "commands.wave.errors.not_found");
      }

      const newWave = !player.state.wave;

      await playerManager.setWave(interaction.guildId!, newWave);

      return await commandService.reply(
        interaction,
        newWave ? "commands.wave.enabled" : "commands.wave.disabled",
      );
    } catch (error) {
      logger.error(
        getDeps().t("commands.wave.errors.playback", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return await commandService.reply(interaction, "commands.wave.errors.playback", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
