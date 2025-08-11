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
					"commands.skip.errors.not_found",
				);
			}
			await bot.playerManager.skip(interaction.guildId!);
			await bot.commandService.reply(interaction, "commands.skip.skipped");
		} catch (error) {
			bot.logger.error(
				bot.locale.t("commands.skip.errors.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			await bot.commandService.reply(
				interaction,
				"commands.skip.errors.playback",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}
}
