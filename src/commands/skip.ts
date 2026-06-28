import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";

@Discord()
export class SkipCommand {
  @Slash({
    name: "skip",
    description: t("commands.skip.description"),
  })
  async skip(interaction: CommandInteraction): Promise<void> {
    const { playerManager, commandService, logger } = getDeps();
    try {
      const player = playerManager.getPlayer(interaction.guildId!);
      if (!player) {
        return await commandService.reply(interaction, "commands.skip.errors.not_found");
      }
      await commandService.reply(interaction, "commands.skip.skipped");
      await playerManager.skip(interaction.guildId!);
    } catch (error) {
      logger.error(
        getDeps().t("commands.skip.errors.playback", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      await commandService.reply(interaction, "commands.skip.errors.playback", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
