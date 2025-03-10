import {
	ApplicationCommandOptionType,
	CommandInteraction,
	GuildMember,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { bot } from "../bot.js";

@Discord()
export class OtherCommand {
	@Slash({ name: "other", description: "Additional commands" })
	async other(
		@SlashOption({
			name: "command",
			description: "Select command",
			type: ApplicationCommandOptionType.String,
			required: true,
		})
		command: "history" | "top" | "queuedel",
		interaction: CommandInteraction,
	): Promise<void> {
		switch (command) {
			case "history":
				const userId = interaction.user.id;
				const tracks = await bot.queueService.getLastPlayedTracks(userId);

				if (tracks.length === 0) {
					await bot.commandService.reply(
						interaction,
						bot.locale.t('commands.other.no_recently_played_tracks')
					);
					return;
				}

				const trackList = tracks
					.map((track, index) => `${index + 1}. ${track.info}`)
					.join("\n");
				await bot.commandService.reply(
					interaction,
					`${bot.locale.t('commands.other.recently_played_tracks')}:\n${trackList}`
				);
				break;

			case "top":
				const topTracks = await bot.queueService.getTopPlayedTracks();

				if (topTracks.length === 0) {
					await bot.commandService.reply(
						interaction,
						bot.locale.t('commands.other.no_popular_tracks')
					);
					return;
				}

				const topTrackList = topTracks
					.map((track, index) => `${index + 1}. ${track.info}`)
					.join("\n");
				await bot.commandService.reply(
					interaction,
					`${bot.locale.t('commands.other.popular_tracks')}:\n${topTrackList}`
				);
				break;

			case "queuedel":
				const member = interaction.member as GuildMember;
				if (!member.voice?.channel) {
					await bot.commandService.reply(
						interaction,
						bot.locale.t('commands.queue.not_in_voice_channel')
					);
					return;
				}

				const channelId = member.voice.channel.id;
				const queue = await bot.queueService.getQueue(channelId);

				if (queue.tracks.length === 0) {
					await bot.commandService.reply(
						interaction,
						bot.locale.t('commands.queue.empty')
					);
					return;
				}

				await bot.queueService.clearQueue(channelId);
				await bot.commandService.reply(
					interaction,
					bot.locale.t('commands.queue.cleared')
				);
				break;
		}
	}
}
