import NodeCache from "node-cache";
import { logger } from "../../utils/index.js";
import retry from 'async-retry';
import { Types, WrappedYMApi, YMApi } from "ym-api-meowed";
import { z } from "zod";
import { Discord } from "discordx";
import { URL } from 'url';

const ConfigSchema = z.object({
    access_token: z.string(),
    uid: z.number(),
});

const SearchTrackResultSchema = z.object({
    id: z.string().optional(),
    title: z.string(),
    artists: z.array(z.object({ name: z.string() })),
    albums: z.array(z.object({ title: z.string().optional() })),
    source: z.literal('yandex')
});

type Config = z.infer<typeof ConfigSchema>;
type SearchTrackResult = z.infer<typeof SearchTrackResultSchema>;

@Discord()
export class YandexService {
    private results: SearchTrackResult[] = [];
    private wrapper: WrappedYMApi;
    private api: YMApi;
    private cache: NodeCache;
    private initialized = false;

    constructor() {
        this.wrapper = new WrappedYMApi();
        this.api = new YMApi();
        this.cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
    }

    hasAvailableResults(): boolean {
        return this.results.length > 0;
    }

    async searchName(trackName: string): Promise<SearchTrackResult[]> {
        await this.ensureInitialized();

        const cacheKey = `search_${trackName}`;
        const cachedResult = this.cache.get<SearchTrackResult[]>(cacheKey);

        if (cachedResult) {
            if (this.cache.getTtl(cacheKey)! < Date.now()) {
                void this.updateCacheInBackground(trackName, cacheKey);
            }
            return cachedResult;
        }

        return this.updateCacheInBackground(trackName, cacheKey);
    }

    async searchURL(url: string): Promise<string> {
        await this.ensureInitialized();

        try {
            const parsedUrl = new URL(url);
            if (!parsedUrl.hostname.includes('music.yandex.ru')) {
                return '';
            }

            const pathSegments = parsedUrl.pathname.split('/');
            const trackIndex = pathSegments.indexOf('track');
            if (trackIndex === -1 || trackIndex === pathSegments.length - 1) {
                logger.warn('Invalid URL structure');
                return '';
            }

            const trackId = pathSegments[trackIndex + 1];
            logger.info(`Extracted track ID: ${trackId}`);

            return trackId;
        } catch (error) {
            logger.error("Error parsing URL:", error instanceof Error ? error.message : String(error));
            return '';
        }
    }

    async getTrackUrl(trackId?: string): Promise<string> {
        await this.ensureInitialized();

        if (!trackId) {
            logger.error("Error getting track URL: trackId is undefined");
            return '';
        }

        try {
            const trackUrl = await retry(
                async () => this.wrapper.getMp3DownloadUrl(Number(trackId), false, Types.DownloadTrackQuality.High),
                { 
                    retries: 3, 
                    factor: 2, 
                    minTimeout: 1000, 
                    maxTimeout: 5000,
                    onRetry: (error) => {
                        logger.warn(`Retrying to get track URL for ID ${trackId}. Error: ${error.message}`);
                    }
                }
            );
            return trackUrl?.toString() ?? '';
        } catch (error) {
            logger.error(`Error getting track URL for ID ${trackId}:`, error instanceof Error ? error.message : String(error));
            return '';
        }
    }

    clearCache(): void {
        this.cache.flushAll();
        this.results = [];
    }

    getResults(): SearchTrackResult[] {
        return [...this.results];
    }

    private async updateCacheInBackground(trackName: string, cacheKey: string): Promise<SearchTrackResult[]> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await retry<{ tracks?: { results: any[] } } | undefined>(
                async () => this.api.searchTracks(trackName),
                { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 }
            );

            if (!result?.tracks?.results) {
                logger.warn(`No results found for track: ${trackName}`);
                return [];
            }

            const formattedTracks = result.tracks.results.map(track => ({
                id: track.realId,
                title: track.title,
                artists: track.artists.map((artist: { name: string }) => ({ name: artist.name })),
                albums: track.albums.map((album: { title?: string }) => ({ title: album.title })),
                source: 'yandex' as const
            }));

            const validatedTracks = formattedTracks.filter(track => {
                const parseResult = SearchTrackResultSchema.safeParse(track);
                if (!parseResult.success) {
                    logger.warn(`Invalid track data: ${JSON.stringify(parseResult.error)}`);
                }
                return parseResult.success;
            });

            this.cache.set(cacheKey, validatedTracks);
            this.results = validatedTracks;
            return validatedTracks;
        } catch (error) {
            logger.error("Error searching for track:", error instanceof Error ? error.message : String(error));
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

    private async ensureInitialized(): Promise<void> {
        if (this.initialized) return;
        try {
            const config = this.loadConfig();
            await Promise.all([this.wrapper.init(config), this.api.init(config)]);
            this.initialized = true;
        } catch (error) {
            logger.error("Error initializing API:", error instanceof Error ? error.message : String(error));
            throw new Error("Failed to initialize YandexService");
        }
    }
}