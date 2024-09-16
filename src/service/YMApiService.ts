import { WrappedYMApi, YMApi, Types } from "ym-api-meowed";
import { QueueService } from "../service/index.js";
import { Logger } from 'winston';
import logger from './logger.js';
import NodeCache from 'node-cache';
import retry from 'async-retry';
import { trackPlayCounter } from './monitoring.js';
import { Track } from "./QueueService.js";

interface Config {
    access_token: string;
    uid: number;
}

interface SearchTrackResult {
    id: number;
    title: string;
    artists: Array<{ name: string }>;
    albums: Array<{ title: string }>;
}

export class YMApiService {
    private wrapper: WrappedYMApi;
    private api: YMApi;
    private logger: Logger;
    private cache: NodeCache;

    constructor() {
        this.wrapper = new WrappedYMApi();
        this.api = new YMApi();
        this.logger = logger;
        this.cache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes
        this.init();
    }

    private loadConfig(): Config {
        const access_token = process.env.YM_API_KEY;
        const uid = process.env.YM_USER_ID;

        if (!access_token || !uid) {
            throw new Error("Missing YM_API_KEY or YM_USER_ID in environment variables");
        }

        return {
            access_token,
            uid: Number(uid),
        };
    }

    private async init(): Promise<void> {
        try {
            const config = this.loadConfig();
            await Promise.all([this.wrapper.init(config), this.api.init(config)]);
            this.logger.info("APIWrapper and API successfully initialized");
        } catch (error) {
            this.logger.error("Error initializing API:", error);
            throw new Error("Failed to initialize YMApiService");
        }
    }

    /**
     * Searches for tracks based on the given name.
     * @param {string} trackName - The name of the track to search for.
     * @returns {Promise<SearchTrackResult[]>} An array of search results.
     * @throws {Error} If the search fails.
     */
    public async searchTrack(trackName: string): Promise<SearchTrackResult[]> {
        const cacheKey = `search_${trackName}`;
        const cachedResult = this.cache.get<SearchTrackResult[]>(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }

        return retry(async (bail) => {
            try {
                const result = await this.api.searchTracks(trackName);
                const tracks = result?.tracks?.results as SearchTrackResult[] ?? [];
                this.cache.set(cacheKey, tracks);
                return tracks;
            } catch (error) {
                if (error.message.includes("Rate limit exceeded")) {
                    this.logger.warn("Rate limit exceeded, retrying...");
                    throw error; // This will trigger a retry
                }
                this.logger.error("Error searching for track:", error);
                bail(new Error("Failed to search for track"));
                return [];
            }
        }, {
            retries: 3,
            factor: 2,
            minTimeout: 1000,
            maxTimeout: 5000,
        });
    }

    /**
     * Retrieves the URL for a given track.
     * @param {number} trackId - The ID of the track.
     * @returns {Promise<string>} The URL of the track.
     * @throws {Error} If the URL cannot be retrieved.
     */
    public async getTrackUrl(trackId: number): Promise<string> {
        return retry(async (bail) => {
            try {
                const trackUrl = await this.wrapper.getMp3DownloadUrl(trackId, false, Types.DownloadTrackQuality.High);
                if (!trackUrl) {
                    throw new Error("Failed to get download URL for track");
                }
                return trackUrl;
            } catch (error) {
                if (error.message.includes("Rate limit exceeded")) {
                    this.logger.warn("Rate limit exceeded, retrying...");
                    throw error; // This will trigger a retry
                }
                this.logger.error("Error getting track URL:", error);
                bail(new Error("Failed to get track URL"));
                return "";
            }
        }, {
            retries: 3,
            factor: 2,
            minTimeout: 1000,
            maxTimeout: 5000,
        });
    }

    /**
     * Finds a similar track to the last played track in a specific channel.
     * @param {string} channelId - The ID of the channel.
     * @param {QueueService} queueService - The queue service instance.
     * @returns {Promise<Track | null>} A similar track or null if not found.
     */
    public async getSimilarTrack(channelId: string, queueService: QueueService): Promise<Track | null> {
        try {
            const lastTrackId = await queueService.getLastTrackID(channelId);
            if (!lastTrackId) {
                throw new Error('No last track ID found');
            }
    
            const similarTracks = await this.api.getSimmilarTracks(lastTrackId);
            if (!similarTracks.similarTracks || similarTracks.similarTracks.length === null) {
                throw new Error('No similar tracks found');
            }
    
            const trackSimilar = similarTracks.similarTracks[0];
            const trackUrl = await this.getTrackUrl(Number(trackSimilar.id));
            const trackInfo = this.formatTrackInfo(trackSimilar);
    
            this.logger.info(`Similar track found: ${trackInfo}`);
            trackPlayCounter.inc({ status: 'success' });
            return {
                trackId: trackSimilar.id,
                info: trackInfo,
                url: trackUrl,
            };
        } catch (error) {
            this.logger.error("Error getting similar track:", error);
            trackPlayCounter.inc({ status: 'failure' });
            return null;
        }
    }

    private formatTrackInfo(track: SearchTrackResult): string {
        const artists = track.artists.map((artist) => artist.name).join(", ");
        return `${artists} - ${track.title}`;
    }
}