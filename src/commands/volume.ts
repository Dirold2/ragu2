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
        max: config.audio.volume.range.max * 100,
      }),
      type: ApplicationCommandOptionType.Number,
      required: true,
    })
    volume: number,
    interaction: CommandInteraction,
  ): Promise<void> {
    const { commandService, playerControl } = getDeps();
    const result = await playerControl.setVolume(interaction.guildId ?? "", volume);

    if (!result.ok) {
      await commandService.reply(interaction, "commands.volume.errors.error_max", {
        maxVolume: config.audio.volume.range.max * 100,
      });
      return;
    }

    await commandService.reply(interaction, "commands.volume.set", { volume: result.data.volume });
  }
}
