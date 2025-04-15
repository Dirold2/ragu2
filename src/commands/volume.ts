import { ApplicationCommandOptionType, CommandInteraction } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";

import { bot } from "../bot.js";
import { MAX_VOLUME } from "../config.js";

@Discord()
export class VolumeCommand {
	@Slash({
		name: "volume",
		description: bot.locale.t("commands.volume.description"),
	})
	async volume(
		@SlashOption({
			name: "number",
			description: bot.locale.t("commands.volume.option_number", {
				max: MAX_VOLUME,
			}),
			type: ApplicationCommandOptionType.Number,
			required: true,
		})
		volume: number,
		interaction: CommandInteraction,
	): Promise<void> {
		if (volume < 0 || volume > MAX_VOLUME) {
			return bot.commandService.reply(
				interaction,
				"commands.volume.errors.error_max", {
					maxVolume: MAX_VOLUME,
				},
			);
		}

		try {
			await bot.playerManager.setVolume(interaction.guildId!, volume);
			await bot.commandService.reply(
				interaction,
				"commands.volume.set", { volume }
			);
		} catch (error) {
			bot.logger.error(
				bot.locale.t("commands.volume.errors.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			await bot.commandService.reply(
				interaction,
				"commands.volume.errors.playback", {
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}
}
