import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

import { bot } from "../bot.js";

@Discord()
export class PauseCommand {
	@Slash({ name: "pause", description: `Pause or resume the current track` })
	async pause(interaction: CommandInteraction): Promise<void> {
		await bot.playerManager.togglePause(interaction);
	}
}
