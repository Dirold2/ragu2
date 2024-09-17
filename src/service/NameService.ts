import { logger, trackPlayCounter } from "../utils/index.js";
import { ActionRowBuilder, CacheType, 
    CommandInteraction, GuildMember, 
    Message, StringSelectMenuBuilder, 
    StringSelectMenuInteraction, TextChannel 
} from "discord.js";
import { Discord, SelectMenuComponent } from "discordx";
import { Logger } from "winston";
import { CommandService, QueueService, 
    PlayerService, YandexService, 
    YouTubeService 
} from "./index.js";

interface SearchTrackResult {
    id: number;
    title: string;
    artists: { name: string }[];
    albums: { title: string }[];
}

@Discord()
class NameService {
    private logger: Logger;
    private readonly commandService: CommandService;
    private readonly yandexService: YandexService;
    private readonly youtubeService: YouTubeService;
    private readonly queueService: QueueService;
    private readonly playerService: PlayerService;

    constructor() {
        this.logger = logger;
        this.commandService = new CommandService();
        this.yandexService = new YandexService();
        this.youtubeService = new YouTubeService();
        this.queueService = new QueueService();
        this.playerService = new PlayerService();
    }

    public async searchTrack(trackName: string): Promise<SearchTrackResult[]> {
        try {
            this.logger.info(`Searching for track "${trackName}"...`);

            const results = await Promise.all([
                this.yandexService.searchName(trackName).catch(error => {
                    this.logger.warn(`Error in YandexService: ${error.message}`);
                    return [];
                }),
                this.youtubeService.hasAvailableResults()
                    ? this.youtubeService.searchName(trackName).catch(error => {
                        this.logger.warn(`Error in YouTubeService: ${error.message}`);
                        return [];
                    })
                    : []
            ]);

            const [yandexResults, youtubeResults] = results;
            const allResults = [...yandexResults, ...youtubeResults];

            if (allResults.length > 0) {
                this.logger.info(`Found ${allResults.length} results in combined search`);
                return allResults;
            }

            this.logger.warn('No results found in either Yandex or YouTube services');
            throw new Error('Neither Yandex nor YouTube have available results');

        } catch (error) {
            this.logger.error(`Error searching for track: ${error.message}`);
            throw new Error('Failed to search for track');
        }
    }

    private truncateText(text: string, maxLength: number): string {
        return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
    }

    public buildTrackOptions(tracks: SearchTrackResult[]): ActionRowBuilder<StringSelectMenuBuilder> {
        const options = tracks.map((track, index) => ({
            label: this.truncateText(`${track.artists.map(artist => artist.name).join(', ')} - ${track.title}`, 100),
            description: this.truncateText(track.albums[0]?.title ?? 'Unknown album', 50),
            value: index.toString()
        }));

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
            filter: (i): i is StringSelectMenuInteraction<"cached"> => i.isStringSelectMenu(),
            time: 10000,
        });
    
        collector.on("collect", async (i: StringSelectMenuInteraction<"cached">) => {
            const selectedTrack = tracks[Number(i.values[0])];
            if (!selectedTrack) {
                await this.commandService.send(interaction, "Error: Selected track not found.");
                return;
            }
            await this.processTrackSelection(i, selectedTrack, interaction, message);
        });
    
        collector.on("end", async (_collected, reason) => {
            if (reason === 'time') {
                setTimeout(async () => {
                    await this.commandService.delete(message);
                }, 3000);
            }
        });
    }
    
    private async processTrackSelection(
        _i: StringSelectMenuInteraction<"cached">,
        selectedTrack: SearchTrackResult,
        interaction: CommandInteraction<CacheType>,
        message: Message
    ): Promise<void> {
        try {
            const member = interaction.member;
            if (!(member instanceof GuildMember)) {
                throw new Error('Invalid member type');
            }
    
            const channelId = member.voice.channel?.id;
            if (!channelId) {
                throw new Error('User is not in a voice channel');
            }
    
            const trackUrl = await this.yandexService.getTrackUrl(selectedTrack.id);
            const artists = selectedTrack.artists.map(artist => artist.name).join(', ');
            const trackInfo = `${artists} - ${selectedTrack.title}`;
    
            this.queueService.setTrack(channelId, {
                trackId: selectedTrack.id,
                info: trackInfo,
                url: trackUrl,
            });
    
            await this.queueService.setLastTrackID(channelId, selectedTrack.id);
            await this.commandService.send(interaction, `Added to queue: ${trackInfo}`);
    
            await this.playerService.joinChannel(interaction);
    
            trackPlayCounter.inc({ status: 'success' });
        } catch (error) {
            this.logger.error(`Error processing track selection: ${error.message}`, error);
            await this.commandService.send(interaction, "An error occurred while processing your request.");
            trackPlayCounter.inc({ status: 'failure' });
        } finally {
            await this.commandService.delete(message);
        }
    }
    
}

export { NameService }