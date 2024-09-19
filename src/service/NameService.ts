import { logger, trackPlayCounter } from "../utils/index.js";
import {
    CommandInteraction,
    GuildMember,
} from "discord.js";
import { Discord } from "discordx";
import { CommandService, QueueService, PlayerService, YandexService, YouTubeService } from "./index.js";
import { z } from "zod";

const TrackResultSchema = z.object({
    id: z.string(),
    title: z.string(),
    artists: z.array(z.object({ name: z.string() })),
    albums: z.array(z.object({ title: z.string().optional() })).optional(),
    source: z.enum(['yandex', 'youtube'])
});

const TrackUrlSchema = z.string().url();

type SearchTrackResult = z.infer<typeof TrackResultSchema>;

@Discord()
class NameService {
    private readonly yandexService: YandexService;
    private readonly youtubeService: YouTubeService;
    private readonly commandService: CommandService;
    private readonly queueService: QueueService;
    private readonly playerService: PlayerService;
    
    constructor() {
        this.yandexService = new YandexService();
        this.youtubeService = new YouTubeService();
        this.commandService = new CommandService();
        this.queueService = new QueueService();
        this.playerService = new PlayerService();
    }

    public async searchName(trackName: string): Promise<SearchTrackResult[]> {
        logger.info(`Поиск трека "${trackName}"...`);

        try {
            const yandexResults = await this.searchAndValidate(this.yandexService, trackName, 'yandex');
            if (yandexResults.length > 0) {
                return yandexResults;
            }

            const youtubeResults = await this.searchAndValidate(this.youtubeService, trackName, 'youtube');
            if (youtubeResults.length > 0) {
                return youtubeResults;
            }
        } catch (error) {
            logger.warn(`Ошибка при поиске: ${error.message}`);
        }

        logger.warn('Результаты не найдены');
        return [];
    }

    private async searchAndValidate(service: YandexService | YouTubeService, trackName: string, source: 'yandex' | 'youtube'): Promise<SearchTrackResult[]> {
        const results = await service.searchName(trackName);
        const validatedResults = results
            .map(r => TrackResultSchema.safeParse({ ...r, source }))
            .filter((result): result is z.SafeParseSuccess<SearchTrackResult> => result.success)
            .map(result => result.data);

        logger.info(`Найдено ${validatedResults.length} результатов в ${source}Service`);
        return validatedResults;
    }

    public async processTrackSelection(
        selectedTrack: SearchTrackResult,
        interaction: CommandInteraction,
    ): Promise<void> {
        try {
            const member = interaction.member as GuildMember;
            const channelId = member.voice.channel?.id;
            const guildId = interaction.guild?.id;
            if (!channelId) {
                throw new Error('Пользователь не в голосовом канале');
            }

            const service = selectedTrack.source === 'yandex' ? this.yandexService : this.youtubeService;
            const trackUrl = await service.getTrackUrl(selectedTrack.id);
            TrackUrlSchema.parse(trackUrl);

            const artists = selectedTrack.artists.map(artist => artist.name).join(', ');
            const trackInfo = `${artists} - ${selectedTrack.title}`;

            await this.queueService.setTrack(channelId, guildId, {
                trackId: selectedTrack.id,
                info: trackInfo,
                url: trackUrl,
                source: selectedTrack.source,
            });

            await this.queueService.setLastTrackID(channelId, selectedTrack.id);
            await this.commandService.send(interaction, `Добавлено в очередь: ${trackInfo}`);
            await this.playerService.joinChannel(interaction);

            trackPlayCounter.inc({ status: 'success' });
        } catch (error) {
            logger.error(`Ошибка при обработке выбора трека: ${error.message}`, error);
            await this.commandService.send(interaction, "Произошла ошибка при обработке вашего запроса.");
            trackPlayCounter.inc({ status: 'failure' });
        }
    }
}

export { NameService };