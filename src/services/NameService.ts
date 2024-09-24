import { logger, trackPlayCounter } from "../utils/index.js";
import { CommandInteraction, GuildMember } from "discord.js";
import { Discord } from "discordx";
import { QueueService, PlayerService, YandexService, YouTubeService } from "./index.js";
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
export class NameService {
    constructor(
        private readonly yandexService: YandexService,
        private readonly youtubeService: YouTubeService,
        private readonly queueService: QueueService,
        private readonly playerService: PlayerService
    ) {}

    public async searchName(trackName: string): Promise<SearchTrackResult[]> {
        logger.info(`Поиск трека или URL "${trackName}"...`);

        // Проверка, является ли запрос URL
        if (TrackUrlSchema.safeParse(trackName).success) {
            const trackFromUrl = await this.searchAndProcessURL(trackName);
            if (trackFromUrl) return [trackFromUrl];
        }

        // Если это не URL, продолжаем искать по названию
        const searchServices = [
            { service: this.yandexService, source: 'yandex' as const },
            { service: this.youtubeService, source: 'youtube' as const }
        ];

        for (const { service, source } of searchServices) {
            try {
                const results = await this.searchAndValidate(service, trackName, source);
                if (results.length > 0) return results;
            } catch (error) {
                logger.warn(`Ошибка при поиске в ${source}: ${error.message}`);
            }
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

    // Обновленный метод для обработки URL
    private async searchAndProcessURL(url: string): Promise<SearchTrackResult | null> {
        logger.info(`Обработка URL: ${url}`);

        // Проверяем, является ли это Yandex URL
        if (url.includes('music.yandex.ru')) {
            const yandexResult = await this.yandexService.searchURL(url);
            if (yandexResult) {
                const validation = TrackResultSchema.safeParse(yandexResult);
                if (validation.success) {
                    return validation.data;
                } else {
                    logger.warn('Некорректный формат данных из YandexService');
                }
            }
        } 
        // Проверяем, является ли это YouTube URL
        else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const youtubeResult = await this.youtubeService.searchURL(url);
            if (youtubeResult) {
                const validation = TrackResultSchema.safeParse(youtubeResult);
                if (validation.success) {
                    return validation.data;
                } else {
                    logger.warn('Некорректный формат данных из YouTubeService');
                }
            }
        }

        logger.warn('Не удалось обработать URL');
        return null;
    }

    public async processTrackSelection(selectedTrack: SearchTrackResult, interaction: CommandInteraction): Promise<void> {
        try {
            const member = interaction.member as GuildMember;
            const channelId = member.voice.channel?.id;
            if (!channelId) throw new Error('Пользователь не в голосовом канале');

            const service = selectedTrack.source === 'yandex' ? this.yandexService : this.youtubeService;
            const trackUrl = await service.getTrackUrl(selectedTrack.id);
            TrackUrlSchema.parse(trackUrl);

            const trackInfo = `${selectedTrack.artists.map(a => a.name).join(', ')} - ${selectedTrack.title}`;

            const track = {
                trackId: selectedTrack.id,
                info: trackInfo,
                url: trackUrl,
                source: selectedTrack.source,
            };

            await this.playerService.playOrQueueTrack(track);
            await this.queueService.setLastTrackID(channelId, selectedTrack.id);
            await this.safeReply(interaction, `Добавлено в очередь: ${trackInfo}`);
            
            await this.playerService.joinChannel(interaction);

            trackPlayCounter.inc({ status: 'success' });
        } catch (error) {
            logger.error(`Ошибка при обработке выбора трека: ${error.message}`, error);
            await this.safeReply(interaction, "Произошла ошибка при обработке вашего запроса.");
            trackPlayCounter.inc({ status: 'failure' });
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
            logger.error('Error replying to interaction:', error);
        }
    }
}
