import { ApplicationCommandOptionType, CommandInteraction } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";

import { getDeps, t } from "./commandDeps.js";
import config from "../../config.json" with { type: "json" };

@Discord()
export class VolumeCommand {
  @Slash({
    name: "volume",
    description: t("commands.volume.description"),
  })
  async volume(
    @SlashOption({
      name: "number",
      description: t("commands.volume.option_number", {
        max: config.volume.max * 100,
      }),
      type: ApplicationCommandOptionType.Number,
      required: true,
    })
    volume: number,
    interaction: CommandInteraction,
  ): Promise<void> {
    const { playerManager, commandService, logger } = getDeps();
    if (volume < 0 || volume > config.volume.max * 100) {
      return commandService.reply(interaction, "commands.volume.errors.error_max", {
        maxVolume: config.volume.max * 100,
      });
    }

    try {
      await playerManager.setVolume(interaction.guildId!, volume);
      await commandService.reply(interaction, "commands.volume.set", {
        volume,
      });
    } catch (error) {
      logger.error(
        getDeps().t("commands.volume.errors.playback", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      await commandService.reply(interaction, "commands.volume.errors.playback", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
