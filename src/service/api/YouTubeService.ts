import { Discord } from "discordx";
import YTMusic from "ytmusic-api";
import logger from "../../utils/logger.js";
import { z } from 'zod';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';

const SearchTrackResultSchema = z.object({
    id: z.string().optional(),
    title: z.string(),
    artists: z.array(z.object({ name: z.string().min(1) })),
    albums: z.array(z.object({ title: z.string().optional() })),
    source: z.string()
});

type SearchTrackResult = z.infer<typeof SearchTrackResultSchema>;

@Discord()
class YouTubeService {
    private results?: SearchTrackResult[];
    private ytmusic: YTMusic;

    constructor() {
        this.ytmusic = new YTMusic();
        this.ytmusic.initialize();
    }

    hasAvailableResults(): boolean {
        return !!this.results?.length;
    }

    async searchName(trackName: string): Promise<SearchTrackResult[]> {
        try {
            const tracks = await this.ytmusic.searchSongs(trackName);
            const formattedTracks = tracks.map(track => ({
                id: track.videoId,
                title: track.name,
                artists: [{ name: track.artist.name }],
                albums: track.album ? [{ title: track.album.name }] : [],
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

    async getTrackUrl(videoId?: string): Promise<string> {
        if (!videoId) {
            logger.error("Error getting track URL: videoId is undefined");
            return '';
        }

        try {
            const url = `http://www.youtube.com/watch?v=${videoId}`;
            const filePath = `./lib/${videoId}.mp3`;
            const stream = ytdl(url).pipe(fs.createWriteStream(filePath));

            return new Promise((resolve, reject) => {
                stream.on('finish', () => resolve(`lib/${videoId}.mp3`));
                stream.on('error', (error) => reject(error));
            });
        } catch (error) {
            logger.error(`Error getting YouTube audio URL: ${error.message}`);
            return '';
        }
    }
}

export { YouTubeService };
