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
    const { commandService, playerManager, queueService, logger } = getDeps();
    try {
      const guildId = interaction.guildId;
      if (!guildId) {
        await commandService.reply(interaction, "commands.shuffle.errors.guild_only");
        return;
      }

      const player = playerManager?.getPlayer(guildId);
      if (!player) {
        await commandService.reply(interaction, "commands.shuffle.errors.no_player");
        return;
      }

      if (!queueService) {
        await commandService.reply(interaction, "commands.shuffle.errors.no_queue_service");
        return;
      }

      const shuffledCount = await queueService.shuffleTracks(guildId);

      if (shuffledCount <= 1) {
        await commandService.reply(interaction, "commands.shuffle.errors.not_enough_tracks");
        return;
      }

      await commandService.reply(interaction, "commands.shuffle.success", {
        count: shuffledCount,
      });
    } catch (error) {
      logger.error(
        getDeps().t("commands.shuffle.errors.playback", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      await commandService.reply(interaction, "commands.shuffle.errors.playback", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
