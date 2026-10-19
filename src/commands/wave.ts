import { type CommandInteraction, type GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";

@Discord()
export class WaveCommand {
  @Slash({
    name: "wave",
    description: t("commands.wave.description"),
  })
  async toggleWave(interaction: CommandInteraction): Promise<void> {
    const { commandService, playerControl } = getDeps();
    const guildId = interaction.guildId;
    const member = interaction.member as GuildMember;
    if (!guildId || !member.voice.channelId) {
      await commandService.reply(interaction, "commands.wave.errors.not_in_voice_channel");
      return;
    }

    const result = await playerControl.toggleWave(guildId);
    if (!result.ok) {
      await commandService.reply(interaction, "commands.wave.errors.no_yandex_seed");
      return;
    }

    await commandService.reply(
      interaction,
      result.data.enabled ? "commands.wave.enabled" : "commands.wave.disabled",
    );
  }
}
