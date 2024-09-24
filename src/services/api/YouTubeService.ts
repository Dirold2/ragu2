import { Discord } from "discordx";
import YTMusic from "ytmusic-api";
import { logger } from "../../utils/index.js";
import { z } from 'zod';
import ytdl from '@distube/ytdl-core';

const SearchTrackResultSchema = z.object({
    id: z.string().optional(),
    title: z.string(),
    artists: z.array(z.object({ name: z.string().min(1) })),
    albums: z.array(z.object({ title: z.string().optional() })),
    source: z.string()
});

type SearchTrackResult = z.infer<typeof SearchTrackResultSchema>;

@Discord()
export class YouTubeService {
    private results?: SearchTrackResult[];
    private ytmusic: YTMusic;

    constructor() {
        this.ytmusic = new YTMusic();
        this.ytmusic.initialize();

        ytdl.createProxyAgent({ uri: `https://195.3.222.15/`})
    }

    hasAvailableResults(): boolean {
        return !!this.results?.length;
    }

    async searchName(trackName: string): Promise<SearchTrackResult[]> {
        try {
            const tracks = await this.ytmusic.searchVideos(trackName);
            const formattedTracks = tracks.map(track => ({
                id: track.videoId,
                title: track.name,
                artists: [{ name: track.artist.name }],
                albums: [],
                source: 'youtube'
            }));

            this.results = formattedTracks.map(track => SearchTrackResultSchema.parse(track));
            logger.info(`YouTube | Found ${this.results.length} tracks for: ${trackName}`);
            return this.results;
        } catch (error) {
            logger.warn(`Error searching for track: ${error}`);
            return [];
        }
    }

    async searchURL(url: string) {
        logger.info(url);
        return '';
    }

    async getTrackUrl(videoId?: string): Promise<string> {
        if (!videoId) {
            logger.error("Error getting track URL: videoId is undefined");
            return '';
        }

        try {
            const url = `http://www.youtube.com/watch?v=${videoId}`;
            const info = await ytdl.getInfo(url);
            const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
            
            if (audioFormat && audioFormat.url) {
                logger.info(`YouTube | Got download URL for video: ${videoId}`);
                logger.warn(audioFormat.url)
                return audioFormat.url;
            } else {
                logger.error(`No suitable audio format found for video: ${videoId}`);
                return '';
            }
        } catch (error) {
            logger.error(`Error getting YouTube audio URL: ${error.message}`);
            return '';
        }
    }
}