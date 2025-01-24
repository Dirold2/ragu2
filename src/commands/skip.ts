import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { bot } from "../bot.js";
import logger from "../utils/logger.js";

@Discord()
export class SkipCommand {
	@Slash({ description: `Skip the current song`, name: "skip" })
	async skip(interaction: CommandInteraction): Promise<void> {
		try {
			await bot.playerManager.skip(interaction);
		} catch (error) {
			logger.error(
				`${bot.loggerMessages.ERROR_SKIPPING_TRACK}: ${error instanceof Error ? error.message : String(error)}`,
			);
			await bot.commandService.reply(interaction, `${bot.messages.SKIP_ERROR}`);
		}
	}
}
