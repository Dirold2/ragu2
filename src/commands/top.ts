import { bot } from "../bot.js";
import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

@Discord()
export class TopCommand {
    @Slash({ name: "top", description: "Get the top played tracks" })
    async top(interaction: CommandInteraction): Promise<void> {
        const tracks = await bot.queueService.getTopPlayedTracks();

        if (tracks.length === 0) {
            await bot.commandService.reply(interaction, "There are no top played tracks.");
            return;
        }

        const trackList = tracks.map((track, index) => `${index + 1}. ${track.info}`).join("\n");
        await bot.commandService.reply(interaction, `Top played tracks:\n${trackList}`);
    }
} 