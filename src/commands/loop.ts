import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { bot } from "../bot.js";

@Discord()
export class LoopCommand {
	@Slash({
		name: "loop",
		description: bot.locale.t("commands.loop.description"),
	})
	async toggleLoop(interaction: CommandInteraction) {
		try {
			const player = bot.playerManager.getPlayer(interaction.guildId!);
			if (!player) {
				return await bot.commandService.reply(
					interaction,
					"commands.loop.errors.not_found",
				);
			}

			player.state.loop = !player.state.loop;

			await bot.playerManager.setLoop(interaction.guildId!, player.state.loop);

			return await bot.commandService.reply(
				interaction,
				player.state.loop ? "commands.loop.enabled" : "commands.loop.disabled",
				player.state.loop
					? { track: player.state.currentTrack?.info || "" }
					: undefined,
			);
		} catch (error) {
			bot.logger.error(
				bot.locale.t("commands.loop.errors.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return await bot.commandService.reply(
				interaction,
				"commands.loop.errors.playback",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}
}
