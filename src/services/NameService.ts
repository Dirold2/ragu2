import { CommandInteraction, GuildMember } from 'discord.js';
import { z } from 'zod';
import { UserNotInVoiceChannelError, PluginNotFoundError } from '../errors/index.js';
import { MusicServicePlugin, TrackInfo } from '../interfaces/index.js';
import { logger, trackPlayCounter } from '../utils/index.js';
import { PlayerManager, PluginManager, QueueService, SearchTrackResult } from './index.js';

const MESSAGES = {
    EMPTY_PLAYLIST: "The playlist is empty or couldn't be retrieved.",
    NOT_IN_VOICE_CHANNEL: "You must be in a voice channel to use this command.",
    PLAYLIST_ADDED: (count: number) => `Added ${count} tracks from the playlist to the queue.`,
    UNSUPPORTED_TRACK_SOURCE: "The selected track source is not supported.",
    UNEXPECTED_ERROR: "An unexpected error occurred.",
    ADDED_TO_QUEUE: (trackInfo: string) => `Added to queue: ${trackInfo}`,
};

const TrackUrlSchema = z.string().url();

export default class NameService {
    constructor(
        private readonly queueService: QueueService,
        private readonly playerManager: PlayerManager,
        private readonly pluginManager: PluginManager
    ) { }

    async searchName(trackName: string): Promise<SearchTrackResult[]> {
        logger.debug(`Searching for track or URL "${trackName}"...`);

        if (!trackName.trim()) {
            logger.debug("Empty search string");
            return [];
        }

        return TrackUrlSchema.safeParse(trackName).success
            ? this.searchAndProcessURL(trackName)
            : this.searchAcrossPlugins(trackName);
    }

    private async searchAcrossPlugins(trackName: string): Promise<SearchTrackResult[]> {
        const results = await Promise.all(
            this.pluginManager.getAllPlugins().map(plugin => this.searchWithPlugin(plugin, trackName))
        );
        return results.flat();
    }

    private async searchWithPlugin(plugin: MusicServicePlugin, trackName: string): Promise<SearchTrackResult[]> {
        try {
            return await plugin.searchName(trackName);
        } catch (error) {
            logger.warn(`Error searching in ${plugin.name}: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    private async searchAndProcessURL(url: string): Promise<SearchTrackResult[]> {
        logger.debug(`Processing URL: ${url}`);
        const plugin = this.pluginManager.getPluginForUrl(url);
        if (!plugin) {
            logger.warn("Unsupported URL");
            return [];
        }

        try {
            const result = await plugin.searchURL(url);
            return Array.isArray(result) ? result : (result ? [result] : []);
        } catch (error) {
            logger.warn(`Error processing URL with ${plugin.name}: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    async processTrackSelection(selectedTrack: SearchTrackResult, interaction: CommandInteraction): Promise<void> {
        try {
            const { channel, guildId } = this.getVoiceChannelInfo(interaction);
            const plugin = this.getPluginForTrack(selectedTrack);
            const trackUrl = await this.getTrackUrl(plugin, selectedTrack);
            const track = this.createTrackInfo(selectedTrack, trackUrl);

            if (!channel) {
                throw new UserNotInVoiceChannelError();
            }

            await this.addTrackToQueue(track, channel.id!, guildId, interaction);
            trackPlayCounter.inc({ status: "success" });
        } catch (error) {
            await this.handleTrackSelectionError(error, interaction);
            trackPlayCounter.inc({ status: "failure" });
        }
    }

    private getVoiceChannelInfo(interaction: CommandInteraction) {
        const member = interaction.member as GuildMember;
        const channel = member.voice?.channel;
        const guildId = member.guild?.id;
        if (!channel || !guildId) throw new UserNotInVoiceChannelError();
        return { channel, guildId };
    }

    private getPluginForTrack(track: SearchTrackResult): MusicServicePlugin {
        const plugin = this.pluginManager.getPlugin(track.source);
        if (!plugin) throw new PluginNotFoundError(track.source);
        return plugin;
    }

    private async getTrackUrl(plugin: MusicServicePlugin, track: SearchTrackResult): Promise<string> {
        const trackUrl = await plugin.getTrackUrl(track.id);
        return TrackUrlSchema.parse(trackUrl);
    }

    private createTrackInfo(track: SearchTrackResult, url: string): TrackInfo {
        const trackInfo = `${track.artists.map(a => a.name).join(", ")} - ${track.title}`;
        return { trackId: track.id, info: trackInfo, url, source: track.source };
    }

    private async addTrackToQueue(track: TrackInfo, channelId: string, guildId: string, interaction: CommandInteraction): Promise<void> {
        await Promise.all([
            this.playerManager.playOrQueueTrack(guildId, track),
            this.queueService.setLastTrackID(channelId, track.trackId),
            this.safeReply(interaction, MESSAGES.ADDED_TO_QUEUE(track.info)),
            this.playerManager.joinChannel(interaction),
        ]);
    }

    private async handleTrackSelectionError(error: unknown, interaction: CommandInteraction): Promise<void> {
        logger.error(`Error processing track selection: ${error instanceof Error ? error.message : String(error)}`, error);
        if (error instanceof UserNotInVoiceChannelError) {
            await this.safeReply(interaction, MESSAGES.NOT_IN_VOICE_CHANNEL);
        } else if (error instanceof PluginNotFoundError) {
            await this.safeReply(interaction, MESSAGES.UNSUPPORTED_TRACK_SOURCE);
        } else {
            await this.safeReply(interaction, MESSAGES.UNEXPECTED_ERROR);
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

    async processPlaylist(url: string, interaction: CommandInteraction): Promise<void> {
        const playlistTracks = await this.searchAndProcessPlaylistURL(url);
        if (!playlistTracks?.length) {
            await this.safeReply(interaction, MESSAGES.EMPTY_PLAYLIST);
            return;
        }

        const { channel, guildId } = this.getVoiceChannelInfo(interaction);
        await this.addPlaylistTracksToQueue(playlistTracks, channel.id, guildId);
        await this.playerManager.joinChannel(interaction);
        await this.safeReply(interaction, MESSAGES.PLAYLIST_ADDED(playlistTracks.length));
    }

    private async searchAndProcessPlaylistURL(url: string): Promise<SearchTrackResult[]> {
        logger.debug(`Processing playlist URL: ${url}`);
        const plugin = this.pluginManager.getPluginForUrl(url);
        if (!plugin || !plugin.getPlaylistURL) {
            logger.warn("Unsupported playlist URL");
            return [];
        }

        try {
            const tracks = await plugin.getPlaylistURL(url);
            if (!Array.isArray(tracks)) {
                logger.warn("Playlist is not an array");
                return [];
            }
            logger.debug(`Found ${tracks.length} tracks in the playlist.`);
            return tracks;
        } catch (error) {
            logger.warn(`Error processing playlist URL with ${plugin.name}: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    private async addPlaylistTracksToQueue(tracks: SearchTrackResult[], channelId: string, guildId: string): Promise<void> {
        const trackPromises = tracks.map(async (track) => {
            const plugin = this.pluginManager.getPlugin(track.source);
            if (!plugin) return;

            const trackUrl = await plugin.getTrackUrl(track.id);
            if (!trackUrl) return;

            const trackInfo: TrackInfo = {
                trackId: track.id,
                info: `${track.artists.map(a => a.name).join(", ")} - ${track.title}`,
                url: trackUrl,
                source: track.source
            };

            await this.queueService.setTrack(channelId, guildId, trackInfo);
        });

        await Promise.all(trackPromises);
    }
}