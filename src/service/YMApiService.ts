import { WrappedYMApi, YMApi, Types } from "ym-api-meowed";
import { QueueService } from "../service/index.js";
import { Track } from "./QueueService.js";
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
    private wrapper: WrappedYMApi;
    private api: YMApi;
    private logger: Logger<ILogObj>;

    /**
     * Creates an instance of YMApiService.
     * Initializes the API wrapper and logger.
     *
     * @constructor
     */
    constructor() {
        this.wrapper = new WrappedYMApi();
        this.api = new YMApi();
        this.logger = new Logger();
        this.init();
    }

    /**
     * Loads the API configuration from environment variables.
     * Throws an error if the required variables are not set.
     *
     * @private
     * @returns {Config} API configuration object with access token and user ID.
     */
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

    /**
     * Initializes the API and API wrapper using the loaded configuration.
     * Logs successful initialization or catches and logs errors.
     *
     * @private
     * @async
     * @returns {Promise<void>}
     */
    private async init(): Promise<void> {
        try {
            const config = this.loadConfig();
            await Promise.all([this.wrapper.init(config), this.api.init(config)]);
            this.logger.info("APIWrapper and API successfully initialized");
        } catch (error) {
            this.logger.error("Error initializing API:", (error as Error).message);
            throw new Error("Failed to initialize YMApiService");
        }
    }

    /**
     * Searches for a track by its name using the Yandex Music API.
     * Logs the query and returns a list of matching tracks.
     *
     * @public
     * @async
     * @param {string} trackName - The name of the track to search for.
     * @returns {Promise<SearchTrackResult[]>} A list of search results containing relevant track information.
     * @throws {Error} Throws an error if the search fails.
     */
    public async searchTrack(trackName: string): Promise<SearchTrackResult[]> {
        try {
            const result = await this.api.searchTracks(trackName);
            return result?.tracks?.results as SearchTrackResult[] ?? [];
        } catch (error) {
            this.logger.error("Error searching for track:", (error as Error).message);
            throw new Error("Failed to search for track");
        }
    }

    /**
     * Retrieves an MP3 download URL for a specific track ID using the Yandex Music API.
     * Logs the operation and returns the URL if available.
     *
     * @public
     * @async
     * @param {number} trackId - The ID of the track to get the download URL for.
     * @returns {Promise<string>} The track's download URL as a string.
     * @throws {Error} Throws an error if the URL cannot be obtained.
     */
    public async getTrackUrl(trackId: number): Promise<string> {
        try {
            const trackUrl = await this.wrapper.getMp3DownloadUrl(trackId, false, Types.DownloadTrackQuality.High);

            if (!trackUrl) {
                throw new Error("Failed to get download URL for track");
            }
            return trackUrl;
        } catch (error) {
            this.logger.error("Error getting track URL:", (error as Error).message);
            throw new Error("Failed to get track URL");
        }
    }

    /**
     * Finds and returns a similar track to the last played track in a specific channel.
     * Uses the Yandex Music API to find similar tracks and formats information for logging.
     *
     * @public
     * @async
     * @param {string} channelId - The ID of the channel where the last track was played.
     * @param {QueueService} queueService - An instance of the queue service to access track data.
     * @returns {Promise<Track>} A track object containing similar track details and its download URL.
     * @throws {Error} Throws an error if the operation fails or no similar tracks are found.
     */
    public async getSimilarTrack(channelId: string, queueService: QueueService): Promise<Track> {
        try {
            const lastTrackId = await queueService.getLastTrackID(channelId);
            if (!lastTrackId) {
                throw new Error('No last track ID found');
            }

            const similarTracks = await this.api.getSimmilarTracks(lastTrackId);
            if (!similarTracks.similarTracks || similarTracks.similarTracks.length === 0) {
                throw new Error('No similar tracks found');
            }

            const trackSimilar = similarTracks.similarTracks[0];
            const trackUrl = await this.getTrackUrl(Number(trackSimilar.id));
            const trackInfo = this.formatTrackInfo(trackSimilar);

            this.logger.info(`Similar track found: ${trackInfo}`);
            return {
                trackId: trackSimilar.id,
                info: trackInfo,
                url: trackUrl,
            };
        } catch (error) {
            this.logger.error("Error getting similar track:", (error as Error).message);
            throw new Error("Failed to get similar track");
        }
    }

    /**
     * Formats a track's information into a string for easy logging.
     * Concatenates artist names and track title.
     *
     * @private
     * @param {SearchTrackResult} track - The track object with artist and title information.
     * @returns {string} A formatted string with the artist(s) and track title.
     */
    private formatTrackInfo(track: SearchTrackResult): string {
        const artists = track.artists.map((artist) => artist.name).join(", ");
        return `${artists} - ${track.title}`;
    }
}