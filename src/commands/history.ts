import { bot } from "../bot.js";
import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";

@Discord()
export class HistoryCommand {
    @Slash({ name: "history", description: "Get your last played tracks" })
    async history(interaction: CommandInteraction): Promise<void> {
        const userId = interaction.user.id;
        const tracks = await bot.queueService.getLastPlayedTracks(userId);

        if (tracks.length === 0) {
            await bot.commandService.reply(interaction, "You have no recently played tracks.");
            return;
        }

        const trackList = tracks.map((track, index) => `${index + 1}. ${track.info}`).join("\n");
        await bot.commandService.reply(interaction, `Your last played tracks:\n${trackList}`);
    }
} 