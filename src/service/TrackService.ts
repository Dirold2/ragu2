import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    CommandInteraction,
    Message,
    TextChannel,
    CacheType,
    GuildMember,
} from "discord.js";
import { YMApiService } from "./api/YMApiService.js";
import { QueueService, VoiceService, CommandService } from "../service/index.js";
import { Discord, SelectMenuComponent } from 'discordx';
import { Logger } from 'winston';
import logger from '../utils/logger.js';
import { trackPlayCounter } from '../utils/monitoring.js';

interface TrackOption {
    label: string;
    description: string;
    value: string;
}

interface SearchTrackResult {
    id: number;
    title: string;
    artists: Array<{ name: string }>;
    albums: Array<{ title: string }>;
}

@Discord()
export class TrackService {
    private readonly voiceService: VoiceService;
    private readonly commandService: CommandService;
    private readonly apiService: YMApiService;
    private readonly logger: Logger;

    constructor(private queueService: QueueService) {
        this.voiceService = new VoiceService(this.queueService);
        this.commandService = new CommandService();
        this.apiService = new YMApiService();
        this.logger = logger;
    }

    /**
     * Searches for tracks based on the given name.
     * @param {string} trackName - The name of the track to search for.
     * @returns {Promise<SearchTrackResult[]>} An array of search results.
     * @throws {Error} If the search fails.
     */
    public async searchTrack(trackName: string): Promise<SearchTrackResult[]> {
        try {
            return await this.apiService.searchTrack(trackName);
        } catch (error) {
            this.logger.error(`Error searching for track: ${error.message}`);
            throw new Error('Failed to search for track');
        }
    }

    private truncateText(text: string, maxLength: number): string {
        return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
    }

    /**
     * Builds track options for the select menu.
     * @param {SearchTrackResult[]} tracks - The tracks to build options for.
     * @returns {TrackOption[]} An array of track options.
     */
    public buildTrackOptions(tracks: SearchTrackResult[]): TrackOption[] {
        return tracks.map((track, index) => ({
            label: this.truncateText(`${track.artists.map(artist => artist.name).join(', ')} - ${track.title}`, 100),
            description: this.truncateText(track.albums[0]?.title ?? 'Unknown album', 50),
            value: index.toString()
        }));
    }

    /**
     *  Builds a track select menu.
     * @param {TrackOption[]} options - The options to include in the menu.
     * @returns {ActionRowBuilder<StringSelectMenuBuilder>} A select menu builder.
     */
    public buildTrackSelectMenu(options: TrackOption[]): ActionRowBuilder<StringSelectMenuBuilder> {
        return new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("select-track")
                    .setPlaceholder("Select a track")
                    .addOptions(options)
            );
    }

    /**
     * Handles the track selection from the select menu.
     * @param {CommandInteraction<CacheType>} interaction - The interaction that triggered the selection.
     * @param {SearchTrackResult[]} tracks - The tracks to choose from.
     * @param {Message} message - The message containing the select menu.
     */
    @SelectMenuComponent({ id: "select-track" })
    public async handleTrackSelection(
        interaction: CommandInteraction<CacheType>,
        tracks: SearchTrackResult[],
        message: Message
    ): Promise<void> {
        const channel = interaction.channel;
        if (!(channel instanceof TextChannel)) {
            this.logger.error("Invalid channel type");
            return;
        }

        const collector = channel.createMessageComponentCollector({
            filter: (i): i is any => i.isStringSelectMenu(),
            time: 15000,
        });

        collector.on("collect", async (i: StringSelectMenuInteraction) => {
            const selectedTrack = tracks[Number(i.values[0])];
            if (!selectedTrack) {
                await this.commandService.sendReply(interaction, "Error: Selected track not found.");
                return;
            }
            await this.processTrackSelection(i, selectedTrack, interaction, message);
        });

        collector.on("end", async (_collected, reason) => {
            if (reason === 'time') {
                await this.commandService.deleteMessageSafely(message);
            }
        });
    }

    private async processTrackSelection(
        _i: StringSelectMenuInteraction,
        selectedTrack: SearchTrackResult,
        interaction: CommandInteraction<CacheType>,
        message: Message
    ): Promise<void> {
        try {
            const trackUrl = await this.apiService.getTrackUrl(selectedTrack.id);
            const member = interaction.member;
            if (!(member instanceof GuildMember)) {
                throw new Error('Invalid member type');
            }

            const channelId = member.voice.channel?.id;
            if (!channelId) {
                throw new Error('User is not in a voice channel');
            }

            const artists = selectedTrack.artists.map(artist => artist.name).join(', ');
            const trackInfo = `${artists} - ${selectedTrack.title}`;

            await this.queueService.addTrack(channelId, { 
                trackId: selectedTrack.id, 
                info: trackInfo, 
                url: trackUrl 
            });
            await this.queueService.setLastTrackID(channelId, selectedTrack.id);
            await this.commandService.sendReply(interaction, `Added to queue: ${trackInfo}`);
            await this.voiceService.joinChannel(interaction);
            trackPlayCounter.inc({ status: 'success' });
        } catch (error) {
            this.logger.error(`Error processing track selection: ${error.message}`, error);
            await this.commandService.sendReply(interaction, "An error occurred while processing your request.");
            trackPlayCounter.inc({ status: 'failure' });
        } finally {
            await this.commandService.deleteMessageSafely(message);
        }
    }
}