import { z } from "zod";
import { Discord } from "discordx";
import { CommandInteraction, GuildMember } from "discord.js";
import { logger, trackPlayCounter } from "../utils/index.js";
import { QueueService, PlayerManager, PluginManager, SearchTrackResult } from "./index.js";
import { UserNotInVoiceChannelError, PluginNotFoundError } from "../errors/index.js";
import { MusicServicePlugin } from "../interfaces/index.js";

const TrackUrlSchema = z.string().url();

@Discord()
export default class NameService {
    constructor(
        private readonly queueService: QueueService,
        private readonly playerManager: PlayerManager,
        private readonly pluginManager: PluginManager
    ) {}

    public async searchName(trackName: string): Promise<SearchTrackResult[]> {
        logger.debug(`Searching for track or URL "${trackName}"...`);

        if (!trackName.trim()) {
            logger.debug("Empty search string");
            return [];
        }

        if (TrackUrlSchema.safeParse(trackName).success) {
            const trackFromUrl = await this.searchAndProcessURL(trackName);
            if (trackFromUrl) return [trackFromUrl];
        }

        for (const plugin of this.pluginManager.getAllPlugins()) {
            const results = await this.searchWithPlugin(plugin, trackName);
            if (results.length > 0) return results;
        }

        logger.warn("No results found");
        return [];
    }

    private async searchWithPlugin(plugin: MusicServicePlugin, trackName: string): Promise<SearchTrackResult[]> {
        try {
            return await plugin.searchName(trackName);
        } catch (error) {
            logger.warn(`Error searching in ${plugin.name}: ${error.message}`);
            return [];
        }
    }

    private async searchAndProcessURL(url: string): Promise<SearchTrackResult | null> {
        logger.debug(`Processing URL: ${url}`);

        const plugin = this.pluginManager.getPluginForUrl(url);
        if (!plugin) {
            logger.warn("Unsupported URL");
            return null;
        }

        try {
            return await plugin.searchURL(url);
        } catch (error) {
            logger.warn(`Error processing URL with ${plugin.name}: ${error.message}`);
            return null;
        }
    }

    public async processTrackSelection(selectedTrack: SearchTrackResult, interaction: CommandInteraction): Promise<void> {
        try {
            const member = interaction.member as GuildMember;
            const channelId = member.voice.channel?.id;
            const guildId = interaction.guildId;
            if (!channelId || !guildId) throw new UserNotInVoiceChannelError();

            const plugin = this.pluginManager.getPlugin(selectedTrack.source);
            if (!plugin) throw new PluginNotFoundError(selectedTrack.source);

            const trackUrl = await plugin.getTrackUrl(selectedTrack.id);
            TrackUrlSchema.parse(trackUrl);

            const trackInfo = `${selectedTrack.artists.map(a => a.name).join(", ")} - ${selectedTrack.title}`;
            const track = { trackId: selectedTrack.id, info: trackInfo, url: trackUrl, source: selectedTrack.source };

            await Promise.all([
                this.playerManager.playOrQueueTrack(guildId, track),
                this.queueService.setLastTrackID(channelId, selectedTrack.id),
                this.safeReply(interaction, `Added to queue: ${trackInfo}`),
                this.playerManager.joinChannel(interaction),
            ]);

            trackPlayCounter.inc({ status: "success" });
        } catch (error) {
            logger.error(`Error processing track selection: ${error.message}`, error);
            if (error instanceof UserNotInVoiceChannelError) {
                await this.safeReply(interaction, "You need to be in a voice channel to use this command.");
            } else if (error instanceof PluginNotFoundError) {
                await this.safeReply(interaction, "The selected track source is not supported.");
            } else {
                await this.safeReply(interaction, "An unexpected error occurred.");
            }
            trackPlayCounter.inc({ status: "failure" });
        }
    }

    private async safeReply(interaction: CommandInteraction, content: string) {
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(content);
            } else {
                await interaction.reply({ content, ephemeral: true });
            }
        } catch (error) {
            logger.error("Error replying to interaction:", error);
        }
    }
}
