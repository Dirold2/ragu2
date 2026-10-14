import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";
import { getErrorMessage } from "../utils/error.js";

@Discord()
export class BackCommand {
  @Slash({
    name: "back",
    description: t("commands.back.description"),
  })
  async back(interaction: CommandInteraction): Promise<void> {
    const { commandService, logger, playerManager } = getDeps();
    const guildId = interaction.guildId;
    if (!guildId) {
      await commandService.reply(interaction, "commands.back.errors.guild_only");
      return;
    }

    try {
      const previousTrack = await playerManager.back(guildId);
      if (!previousTrack) {
        await commandService.reply(interaction, "commands.back.errors.not_found");
        return;
      }

      await commandService.reply(interaction, "commands.back.success", {
        track: previousTrack.info,
      });
    } catch (error) {
      logger.error(`Failed to return to previous track: ${getErrorMessage(error)}`);
      await commandService.reply(interaction, "commands.back.errors.playback", {
        error: getErrorMessage(error),
      });
    }
  }
}
