import NodeCache from "node-cache";
import logger from "../../utils/logger.js";
import retry from 'async-retry';
import { Types, WrappedYMApi, YMApi } from "ym-api-meowed";
import { Logger } from "winston";
import { Discord } from "discordx";

interface Config {
    access_token: string;
    uid: number;
}

interface SearchTrackResult {
    id: number;
    title: string;
    artists: { name: string }[];
    albums: { title: string }[];
}

abstract class SearchService {
    abstract hasAvailableResults(): boolean;
}

@Discord()
class YandexService extends SearchService {
    private results?: SearchTrackResult[];

    setResults(results: SearchTrackResult[]) {
        this.logger.debug(`Setting ${results.length} search results.`);
        this.results = results;
    }

    hasAvailableResults(): boolean {
        console.log(`Has available results: ${this.results != null && this.results.length > 0}`);
        return this.results != null && this.results.length > 0;
    }

    private wrapper = new WrappedYMApi();
    private api = new YMApi();
    private logger: Logger = logger;
    private cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

    private initialized = false;

    constructor() {
        super();
        this.init();
    }

    public async searchName(trackName: string): Promise<SearchTrackResult[]> {
        const cacheKey = `search_${trackName}`;
        const cachedResult = this.cache.get<SearchTrackResult[]>(cacheKey);

        if (cachedResult) {
            this.logger.debug(`Cache hit for track: ${trackName}`);
            if (this.cache.getTtl(cacheKey) && this.cache.getTtl(cacheKey)! < Date.now()) {
                await this.updateCacheInBackground(trackName, cacheKey);
            }
            return cachedResult;
        }

        return this.updateCacheInBackground(trackName, cacheKey);
    }

    private async updateCacheInBackground(trackName: string, cacheKey: string): Promise<SearchTrackResult[]> {
        return retry(async (bail) => {
            try {
                const result = await this.api.searchTracks(trackName);
                const tracks = result?.tracks?.results as SearchTrackResult[] ?? [];
                this.logger.info(`Found ${tracks.length} tracks for: ${trackName}`);
                this.cache.set(cacheKey, tracks);
                this.setResults(tracks);
                return tracks;
            } catch (error) {
                if (error.message.includes("Rate limit exceeded")) {
                    this.logger.warn("Rate limit exceeded, retrying...");
                    throw error;
                }
                this.logger.error("Error searching for track:", error);
                bail(new Error("Failed to search for track"));
                return [];
            }
        }, { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 });
    }

    public async getTrackUrl(trackId: number): Promise<string> {
        return retry(async (bail) => {
            try {
                const trackUrl = await this.wrapper.getMp3DownloadUrl(trackId, false, Types.DownloadTrackQuality.High);
                if (!trackUrl) throw new Error("Failed to get download URL for track");
                return trackUrl;
            } catch (error) {
                if (error.message.includes("Rate limit exceeded")) {
                    this.logger.warn("Rate limit exceeded, retrying...");
                    throw error;
                }
                this.logger.error("Error getting track URL:", error);
                bail(new Error("Failed to get track URL"));
                return "";
            }
        }, { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 });
    }

    private loadConfig(): Config {
        const access_token = process.env.YM_API_KEY;
        const uid = process.env.YM_USER_ID;
        if (!access_token || !uid) throw new Error("Missing YM_API_KEY or YM_USER_ID in environment variables");
        return { access_token, uid: Number(uid) };
    }

    private async init(): Promise<void> {
        if (this.initialized) return;
        try {
            const config = this.loadConfig();
            await Promise.all([this.wrapper.init(config), this.api.init(config)]);
            this.logger.info("APIWrapper and API successfully initialized");
            this.initialized = true;
        } catch (error) {
            this.logger.error("Error initializing API:", error);
            throw new Error("Failed to initialize YMApiService");
        }
    }
}

export { YandexService }