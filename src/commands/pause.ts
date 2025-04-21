import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { bot } from "../bot.js";

@Discord()
export class PauseCommand {
	@Slash({
		name: "pause",
		description: bot.locale.t("commands.pause.description"),
	})
	async pause(interaction: CommandInteraction): Promise<void> {
		const player = bot.playerManager.getPlayer(interaction.guildId!);
		if (!player) {
			return await bot.commandService.reply(
				interaction,
				"commands.pause.errors.not_found",
			);
		}

		await bot.playerManager.togglePause(interaction);

		return await bot.commandService.reply(
			interaction,
			player.state.pause ? "commands.pause.paused" : "commands.pause.resumed",
			undefined,
		);
	}
}
