import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { bot } from "../bot.js";
import logger from "../utils/logger.js";

@Discord()
export class LoopCommand {
	@Slash({ name: "loop", description: `Toggle track loop` })
	async toggleLoop(interaction: CommandInteraction) {
		try {
			const player = bot.playerManager.getPlayer(interaction.guildId!);
			if (!player) {
				return await bot.commandService.reply(
					interaction,
					`${bot.messages.PLAYER_NOT_FOUND}`,
				);
			}

			player.state.loop = !player.state.loop;

			await bot.playerManager.setLoop(interaction.guildId!, player.state.loop);

			return await bot.commandService.reply(
				interaction,
				`${player.state.loop ? bot.messages.LOOP_TRACK_ON(player.state.currentTrack?.info) : bot.messages.LOOP_TRACK_OFF}`,
			);
		} catch (error) {
			logger.error(`Error toggling track loop:`, error);
			return await bot.commandService.reply(
				interaction,
				`${bot.messages.LOOP_TRACK_ERROR}`,
			);
		}
	}
}
