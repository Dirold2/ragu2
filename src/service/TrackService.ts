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
import { YMApiService } from "./YMApiService.ts"; // Новый сервис для работы с API
import { QueueService, VoiceService, CommandService } from "../service/index.ts"; // Другие сервисы
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
    private logger: Logger<ILogObj> = new Logger();

    constructor(private queueService: QueueService) {
        this.voiceService = new VoiceService(this.queueService);
        this.commandService = new CommandService();
        this.apiService = new YMApiService();
    }

    async searchTrack(trackName: string): Promise<SearchTrackResult[]> {
        return await this.apiService.searchTrack(trackName);
    }

    private truncateDescription(text: string, maxLength: number): string {
        return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
    }

    private truncateLabel(text: string, maxLength: number): string {
        return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
    }

    public buildTrackOptions(tracks: SearchTrackResult[]): TrackOption[] {
        return tracks.map((track, index) => ({
            label: this.truncateLabel(`${this.truncateLabel(track.artists.map(artist => artist.name).join(', '), 50)} - ${this.truncateLabel(track.title, 50)}`, 100),
            description: this.truncateDescription(track.albums[0]?.title ?? 'Неизвестный альбом', 50),
            value: index.toString()
        }));
    }

    public buildTrackSelectMenu(options: TrackOption[]): ActionRowBuilder<StringSelectMenuBuilder> {
        return new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(new StringSelectMenuBuilder()
                .setCustomId("select-track")
                .setPlaceholder("Выберите трек")
                .addOptions(options.map(option => ({
                    ...option,
                    label: this.truncateLabel(option.label, 100)
                })))
            );
    }

    @SelectMenuComponent({ id: "select-track" })
    async handleTrackSelection(
        interaction: CommandInteraction<CacheType>,
        tracks: SearchTrackResult[],
        message: Message
    ): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filter = (i: any) => i.isStringSelectMenu();
        const channel = interaction.channel as TextChannel;

        const collector = channel.createMessageComponentCollector({
            filter,
            time: 15000,
        });

        collector.on("collect", async (i: StringSelectMenuInteraction) => {
            const selectedTrack = tracks[Number(i.values[0])];
            if (!selectedTrack) {
                await this.commandService.sendReply(interaction, "Ошибка: выбранный трек не найден.");
                return;
            }
            await this.processTrackSelection(i, selectedTrack, interaction, message);
        });

        // collector.on("timeout", () => {
        //     this.commandService.deleteMessageSafely(message);
        // });
    }

    private async processTrackSelection(
        i: StringSelectMenuInteraction,
        selectedTrack: SearchTrackResult,
        interaction: CommandInteraction<CacheType>,
        message: Message
    ): Promise<void> {
        try {
            const trackUrl = await this.apiService.getTrackUrl(selectedTrack.id);
            const member = interaction.member as GuildMember;
            const channelId = member.voice.channel!.id;
            const artists = selectedTrack.artists.map(artist => artist.name).join(', ');
            const trackInfo = `${artists} - ${selectedTrack.title}`;

            await this.queueService.addTrack(channelId, { trackId: selectedTrack.id, info: trackInfo, url: trackUrl });
            await this.queueService.setLastTrackID(channelId, selectedTrack.id);
            await this.commandService.sendReply(interaction, `Добавлено в очередь: ${trackInfo}`);
            await this.voiceService.joinChannel(interaction);
        } catch (error) {
            this.logger.error(`Ошибка при выборе трека: ${(error as Error)?.message}`, error);
            await this.commandService.sendReply(interaction, "Произошла ошибка при обработке вашего запроса.");
        } finally {
            await this.commandService.deleteMessageSafely(message);
        }
    }
}