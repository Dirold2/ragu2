import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { bot } from "../bot.js";

@Discord()
export class WaveCommand {
	@Slash({
		name: "wave",
		description: bot.locale.t("commands.wave.description"),
	})
	async toggleWave(interaction: CommandInteraction) {
		try {
			const player = bot.playerManager.getPlayer(interaction.guildId!);
			if (!player) {
				return await bot.commandService.reply(
					interaction,
					bot.locale.t("errors.player.not_found"),
				);
			}

			player.state.wave = !player.state.wave;

			await bot.playerManager.setWave(interaction.guildId!, player.state.wave);

			return await bot.commandService.reply(
				interaction,
				bot.locale.t(
					player.state.wave
						? "commands.wave.enabled"
						: "commands.wave.disabled",
				),
			);
		} catch (error) {
			bot.logger.error(
				bot.locale.t("errors.track.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return await bot.commandService.reply(
				interaction,
				bot.locale.t("errors.track.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}
}
