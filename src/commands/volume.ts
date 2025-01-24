import { ApplicationCommandOptionType, CommandInteraction } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";

import { bot } from "../bot.js";
import logger from "../utils/logger.js";
import { MAX_VOLUME } from "../config.js";

@Discord()
export class VolumeCommand {
	@Slash({ name: "volume", description: `Adjust volume` })
	async volume(
		@SlashOption({
			description: `0 - ${MAX_VOLUME}`,
			name: "number",
			type: ApplicationCommandOptionType.Number,
			required: true,
		})
		volume: number,
		interaction: CommandInteraction,
	): Promise<void> {
		if (volume < 0 || volume > MAX_VOLUME) {
			return bot.commandService.reply(
				interaction,
				`${bot.messages.VOLUME_ERROR_MAX_VOLUME(MAX_VOLUME)}`,
			);
		}

		try {
			await bot.playerManager.setVolume(interaction.guildId!, volume);
			await bot.commandService.reply(
				interaction,
				`${bot.messages.VOLUME_SET(volume)}`,
			);
		} catch (error) {
			logger.error(
				`${bot.loggerMessages.ERROR_ADJUSTING_VOLUME}: ${error instanceof Error ? error.message : String(error)}`,
			);
			await bot.commandService.reply(
				interaction,
				`${bot.messages.VOLUME_ERROR}`,
			);
		}
	}
}
