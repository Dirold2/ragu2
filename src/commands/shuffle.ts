import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { bot } from "../bot.js";

@Discord()
export class ShuffleCommand {
	@Slash({
		name: "shuffle",
		description: bot.locale.t("commands.shuffle.description"),
	})
	async toggleShuffle(interaction: CommandInteraction): Promise<void> {
		try {
			const guildId = interaction.guildId;
			if (!guildId) {
				await bot.commandService.reply(
					interaction,
					"commands.shuffle.errors.guild_only",
				);
				return;
			}

			const player = bot.playerManager?.getPlayer(guildId);
			if (!player) {
				await bot.commandService.reply(
					interaction,
					"commands.shuffle.errors.no_player",
				);
				return;
			}

			const queueService = bot.queueService;
			if (!queueService) {
				await bot.commandService.reply(
					interaction,
					"commands.shuffle.errors.no_queue_service",
				);
				return;
			}

			const shuffledCount = await queueService.shuffleTracks(guildId);

			if (shuffledCount <= 1) {
				await bot.commandService.reply(
					interaction,
					"commands.shuffle.errors.not_enough_tracks",
				);
				return;
			}

			await bot.commandService.reply(interaction, "commands.shuffle.success", {
				count: shuffledCount,
			});
		} catch (error) {
			bot.logger.error(
				bot.locale.t("commands.shuffle.errors.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			await bot.commandService.reply(
				interaction,
				"commands.shuffle.errors.playback",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}
}
