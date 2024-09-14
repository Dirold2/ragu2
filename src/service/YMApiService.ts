import { WrappedYMApi, YMApi, Types } from "ym-api-meowed";
import { QueueService } from "../service/index.ts";
import { Track } from "./QueueService.ts";
import { ILogObj, Logger } from "tslog";

interface Config {
    access_token?: string;
    uid?: number;
}

interface SearchTrackResult {
    id: number;
    title: string;
    artists: Array<{ name: string }>;
    albums: Array<{ title: string }>;
}

export class YMApiService {
    private wrapper = new WrappedYMApi();
    private api = new YMApi();
    private logger: Logger<ILogObj> = new Logger();

    constructor() {
        const config: Config = this.loadConfig();
        this.init(config);
    }

    private loadConfig(): Config {
        return {
            access_token: process.env.YM_API_KEY,
            uid: Number(process.env.YM_USER_ID),
        };
    }

    private async init(config: Config): Promise<void> {
        try {
            await Promise.all([this.wrapper.init(config), this.api.init(config)]);
            this.logger.info("APIWrapper и API успешно инициализированы");
        } catch (error) {
            this.logger.error("Ошибка при инициализации API:", (error as Error)?.message);
        }
    }

    public async searchTrack(trackName: string): Promise<SearchTrackResult[]> {
        try {
            const result = await this.api.searchTracks(trackName);
            const tracks = result?.tracks?.results as SearchTrackResult[];
            return tracks;
        } catch (error) {
            this.logger.error("Ошибка при поиске трека:", (error as Error)?.message);
            return [];
        }
    }

    public async getTrackUrl(trackId: number): Promise<string> {
        try {
            const trackUrl = await this.wrapper.getMp3DownloadUrl(trackId, false, Types.DownloadTrackQuality.High);
            if (!trackUrl) throw new Error("Не удалось получить URL для скачивания трека");
            return trackUrl;
        } catch (error) {
            this.logger.error("Ошибка при получении URL трека:", (error as Error)?.message);
            throw error;
        }
    }

    public async getSimilarTrack(channelId: string, queueService: QueueService): Promise<Track> {
        try {
            const lastTrackId = await queueService.getLastTrackID(channelId);
            if (!lastTrackId || typeof lastTrackId !== 'number') {
                throw new Error('Invalid last track ID');
            }

            const similarTracks = await this.api.getSimmilarTracks(lastTrackId);
            if (!similarTracks.similarTracks || similarTracks.similarTracks.length === 0) {
                throw new Error('No similar tracks found.');
            }

            const trackSimilar = similarTracks.similarTracks[0];
            const trackUrl = await this.getTrackUrl(trackSimilar.id);
            const trackInfo = this.formatTrackInfo(trackSimilar);

            this.logger.info(`Похожий трек найден: ${trackInfo}`);
            return {
                trackId: trackSimilar.id,
                info: trackInfo,
                url: trackUrl,
            };
        } catch (error) {
            this.logger.error("Ошибка при получении похожего трека:", error);
            throw error;
        }
    }

    private formatTrackInfo(track: SearchTrackResult): string {
        const artists = track.artists.map((artist) => artist.name).join(", ");
        return `${artists} - ${track.title}`;
    }
}