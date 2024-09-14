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
import { YMApiService } from "./YMApiService.js";
import { QueueService, VoiceService, CommandService } from "../service/index.js";
import { Discord, SelectMenuComponent } from 'discordx';
import { ILogObj, Logger } from "tslog";

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
    private readonly logger: Logger<ILogObj>;

    constructor(private queueService: QueueService) {
        this.voiceService = new VoiceService(this.queueService);
        this.commandService = new CommandService();
        this.apiService = new YMApiService();
        this.logger = new Logger();
    }

    public async searchTrack(trackName: string): Promise<SearchTrackResult[]> {
        try {
            return await this.apiService.searchTrack(trackName);
        } catch (error) {
            this.logger.error(`Error searching for track: ${(error as Error).message}`);
            throw new Error('Failed to search for track');
        }
    }

    private truncateText(text: string, maxLength: number): string {
        return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
    }

    public buildTrackOptions(tracks: SearchTrackResult[]): TrackOption[] {
        return tracks.map((track, index) => ({
            label: this.truncateText(`${track.artists.map(artist => artist.name).join(', ')} - ${track.title}`, 100),
            description: this.truncateText(track.albums[0]?.title ?? 'Unknown album', 50),
            value: index.toString()
        }));
    }

    public buildTrackSelectMenu(options: TrackOption[]): ActionRowBuilder<StringSelectMenuBuilder> {
        return new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("select-track")
                    .setPlaceholder("Select a track")
                    .addOptions(options)
            );
    }

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
        } catch (error) {
            this.logger.error(`Error processing track selection: ${(error as Error).message}`, error);
            await this.commandService.sendReply(interaction, "An error occurred while processing your request.");
        } finally {
            await this.commandService.deleteMessageSafely(message);
        }
    }
}