import { ApplicationCommandOptionType, CommandInteraction } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";

import { bot } from "../bot.js";
import config from "../../config.json" with { type: "json" };

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
				max: config.volume.max * 100,
			}),
			type: ApplicationCommandOptionType.Number,
			required: true,
		})
		volume: number,
		interaction: CommandInteraction,
	): Promise<void> {
		if (volume < 0 || volume > config.volume.max * 100) {
			return bot.commandService.reply(
				interaction,
				"commands.volume.errors.error_max",
				{
					maxVolume: config.volume.max * 100,
				},
			);
		}

		try {
			await bot.playerManager.setVolume(interaction.guildId!, volume);
			await bot.commandService.reply(interaction, "commands.volume.set", {
				volume,
			});
		} catch (error) {
			bot.logger.error(
				bot.locale.t("commands.volume.errors.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			await bot.commandService.reply(
				interaction,
				"commands.volume.errors.playback",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}
}
