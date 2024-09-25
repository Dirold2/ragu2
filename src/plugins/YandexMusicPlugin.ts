import { URL } from 'url';
import retry from 'async-retry';
import { Discord } from "discordx";
import NodeCache from "node-cache";
import { Types, WrappedYMApi, YMApi } from "ym-api-meowed";

import { logger } from "../utils/index.js";
import { MusicServicePlugin, TrackYandex } from '../interfaces/index.js';
import { Config, ConfigSchema, 
    SearchTrackResult, TrackResultSchema 
} from '../types/index.js';

@Discord()
export default class YandexMusicPlugin implements MusicServicePlugin {
    name = 'yandex';
    urlPatterns = [/music\.yandex\.ru/];
    
    private results: SearchTrackResult[] = [];
    private wrapper: WrappedYMApi = new WrappedYMApi();
    private api: YMApi = new YMApi();
    private cache: NodeCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
    private initialized = false;

    hasAvailableResults(): boolean {
        return this.results.length > 0;
    }

    async searchName(trackName: string): Promise<SearchTrackResult[]> {
        await this.ensureInitialized();
        const cacheKey = `search_${trackName}`;
        const cachedResult = this.cache.get<SearchTrackResult[]>(cacheKey) || await this.updateCacheInBackground(trackName, cacheKey);
        return cachedResult;
    }

    async searchURL(url: string): Promise<SearchTrackResult | null> {
        await this.ensureInitialized();
        try {
            const parsedUrl = new URL(url);
            if (!parsedUrl.hostname.includes('music.yandex.ru')) return null;

            const trackId = this.extractTrackId(parsedUrl);
            if (!trackId) return null;

            const trackInfo = await this.api.getTrack(Number(trackId));
            return trackInfo ? this.validateTrackResult(this.formatTrackInfo(trackInfo[0])) : null;
        } catch (error) {
            logger.error(`Error processing URL: ${error.message}`);
            return null;
        }
    }

    async getTrackUrl(trackId: string): Promise<string> {
        await this.ensureInitialized();
        if (!trackId) return '';

        try {
            return await retry(
                () => this.wrapper.getMp3DownloadUrl(Number(trackId), false, Types.DownloadTrackQuality.High),
                { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 }
            ) || '';
        } catch (error) {
            logger.error(`Error getting track URL for ID ${trackId}: ${error.message}`);
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
            const result = await retry(() => this.api.searchTracks(trackName), { retries: 3 });
            if (!result?.tracks?.results) {
                logger.warn(`No results found for track: ${trackName}`);
                return [];
            }

            const validatedTracks = result.tracks.results.map(this.formatTrackInfo).filter(track => TrackResultSchema.safeParse(track).success);
            this.cache.set(cacheKey, validatedTracks);
            this.results = validatedTracks;
            return validatedTracks;
        } catch (error) {
            logger.error(`Error searching for track: ${error.message}`);
            return [];
        }
    }

    private extractTrackId(parsedUrl: URL): string | null {
        const match = parsedUrl.pathname.match(/\/album\/\d+\/track\/(\d+)/);
        return match ? match[1] : null;
    }

    private formatTrackInfo(trackInfo: TrackYandex): SearchTrackResult {
        return {
            id: trackInfo.id.toString(),
            title: trackInfo.title,
            artists: trackInfo.artists.map(artist => ({ name: artist.name })),
            albums: trackInfo.albums.map(album => ({ title: album.title })),
            source: 'yandex',
        };
    }

    private validateTrackResult(searchResult: SearchTrackResult): SearchTrackResult | null {
        const validation = TrackResultSchema.safeParse(searchResult);
        if (!validation.success) logger.warn(`Invalid track data: ${JSON.stringify(validation.error)}`);
        return validation.success ? validation.data : null;
    }

    private loadConfig(): Config {
        const access_token = process.env.YM_API_KEY;
        const uid = Number(process.env.YM_USER_ID);
        if (!access_token || isNaN(uid)) throw new Error("YM_API_KEY and YM_USER_ID must be defined.");

        const config = { access_token, uid };
        const validation = ConfigSchema.safeParse(config);
        if (!validation.success) throw new Error(`Invalid configuration: ${validation.error.errors.map(err => err.message).join(', ')}`);
        return validation.data;
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            try {
                const config = this.loadConfig();
                await Promise.all([this.wrapper.init(config), this.api.init(config)]);
                this.initialized = true;
            } catch (error) {
                logger.error(`Error initializing API: ${error.message}`);
                throw new Error("Failed to initialize YandexService");
            }
        }
    }
}