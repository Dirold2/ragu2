import NodeCache from "node-cache";
import { logger } from "../../utils/index.js";
import retry from 'async-retry';
import { Types, WrappedYMApi, YMApi } from "ym-api-meowed";
import { z } from "zod";
import { Discord } from "discordx";

const ConfigSchema = z.object({
    access_token: z.string(),
    uid: z.number(),
});

const SearchTrackResultSchema = z.object({
    id: z.string().optional(),
    title: z.string(),
    artists: z.array(z.object({ name: z.string() })),
    albums: z.array(z.object({ title: z.string().optional() })),
    source: z.string()
});

type Config = z.infer<typeof ConfigSchema>;
type SearchTrackResult = z.infer<typeof SearchTrackResultSchema>;

@Discord()
export class YandexService {
    private results?: SearchTrackResult[];
    private wrapper = new WrappedYMApi();
    private api = new YMApi();
    private cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
    private initialized = false;

    hasAvailableResults(): boolean {
        return !!this.results?.length;
    }

    async searchName(trackName: string): Promise<SearchTrackResult[]> {
        await this.init();

        const cacheKey = `search_${trackName}`;
        const cachedResult = this.cache.get<SearchTrackResult[]>(cacheKey);

        if (cachedResult) {
            if (this.cache.getTtl(cacheKey)! < Date.now()) {
                this.updateCacheInBackground(trackName, cacheKey);
            }
            return cachedResult;
        }

        return this.updateCacheInBackground(trackName, cacheKey);
    }

    async getTrackUrl(trackId?: string): Promise<string> {
        await this.init();

        if (!trackId) {
            logger.error("Error getting track URL: trackId is undefined");
            return '';
        }

        try {
            const trackUrl = await retry(() => 
                this.wrapper.getMp3DownloadUrl(Number(trackId), false, Types.DownloadTrackQuality.High),
                { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 }
            );
            return trackUrl?.toString() || '';
        } catch (error) {
            logger.error("Error getting track URL:", error);
            return '';
        }
    }

    private async updateCacheInBackground(trackName: string, cacheKey: string): Promise<SearchTrackResult[]> {
        try {
            const result = await retry(() => this.api.search(trackName), 
                { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 });

            const formattedTracks = (result?.tracks?.results || []).map(track => ({
                id: track.realId,
                title: track.title,
                artists: track.artists.map(artist => ({ name: artist.name })),
                albums: track.albums.map(album => ({ title: album.title })),
                source: 'yandex'
            }));

            formattedTracks.forEach(track => {
                if (!SearchTrackResultSchema.safeParse(track).success) {
                    throw new Error("Invalid track data received");
                }
            });

            this.cache.set(cacheKey, formattedTracks);
            this.results = formattedTracks;
            return formattedTracks;
        } catch (error) {
            logger.warn("Error searching for track:", error);
            return [];
        }
    }

    private loadConfig(): Config {
        const config = {
            access_token: process.env.YM_API_KEY,
            uid: Number(process.env.YM_USER_ID)
        };
        const validation = ConfigSchema.safeParse(config);
        if (!validation.success) {
            const errorMessages = validation.error.errors.map(err => err.message);
            throw new Error(`Invalid configuration: ${errorMessages.join(', ')}`);
        }
        return validation.data;
    }

    private async init(): Promise<void> {
        if (this.initialized) return;
        try {
            const config = this.loadConfig();
            await Promise.all([this.wrapper.init(config), this.api.init(config)]);
            this.initialized = true;
        } catch (error) {
            logger.error("Error initializing API:", error);
            throw new Error("Failed to initialize YandexService");
        }
    }
}