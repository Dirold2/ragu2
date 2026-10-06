import { type CommandInteraction, type GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";
import { getErrorMessage } from "../utils/error.js";

@Discord()
export class WaveCommand {
  @Slash({
    name: "wave",
    description: t("commands.wave.description"),
  })
  async toggleWave(interaction: CommandInteraction) {
    const { playerManager, commandService, logger, queueService } = getDeps();
    try {
      const guildId = interaction.guildId;
      const member = interaction.member as GuildMember;
      if (!guildId || !member.voice.channelId) {
        return await commandService.reply(interaction, "commands.wave.errors.not_in_voice_channel");
      }

      const waveEnabled = queueService.getWave(guildId);
      const seedTrack = queueService.getLastTrack(guildId);
      if (!waveEnabled && seedTrack?.source !== "yandex") {
        return await commandService.reply(interaction, "commands.wave.errors.no_yandex_seed");
      }

      await playerManager.setWave(guildId, !waveEnabled);

      return await commandService.reply(
        interaction,
        waveEnabled ? "commands.wave.disabled" : "commands.wave.enabled",
      );
    } catch (error) {
      logger.error(
        getDeps().t("commands.wave.errors.playback", {
          error: getErrorMessage(error),
        }),
      );
      return await commandService.reply(interaction, "commands.wave.errors.playback", {
        error: getErrorMessage(error),
      });
    }
  }
}
