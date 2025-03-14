import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { bot } from "../bot.js";

@Discord()
export class SkipCommand {
	@Slash({
		name: "skip",
		description: bot.locale.t("commands.skip.description"),
	})
	async skip(interaction: CommandInteraction): Promise<void> {
		try {
			const player = bot.playerManager.getPlayer(interaction.guildId!);
			if (!player) {
				return await bot.commandService.reply(
					interaction,
					bot.locale.t("errors.player.not_found"),
				);
			}

			await bot.playerManager.skip(interaction);
			await bot.commandService.reply(
				interaction,
				bot.locale.t("player.status.skipped"),
			);
		} catch (error) {
			bot.logger.error(
				bot.locale.t("errors.track.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			await bot.commandService.reply(
				interaction,
				bot.locale.t("errors.track.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}
}
