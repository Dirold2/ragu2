import YTMusic from 'ytmusic-api';
import ytdl from '@distube/ytdl-core';

import { logger } from '../utils/index.js';
import { MusicServicePlugin } from '../interfaces/index.js';
import { SearchTrackResult, TrackResultSchema } from '../types/index.js';

export default class YouTubeMusicPlagin implements MusicServicePlugin {
    name = 'youtube';
    urlPatterns = [/youtube\.com/];
    private results?: SearchTrackResult[];
    private ytmusic: YTMusic;

    constructor() {
        this.ytmusic = new YTMusic();
        this.ytmusic.initialize();

        const cookies = JSON.parse(process.env.YOUTUBE_COOKIES as string);
        ytdl.createAgent(cookies);
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
                albums: [],
                source: 'youtube'
            }));

            this.results = formattedTracks.map(track => TrackResultSchema.parse(track));
            logger.info(`YouTube | Found ${this.results.length} tracks for: ${trackName}`);
            return this.results;
        } catch (error) {
            logger.warn(`Error searching for track: ${error}`);
            return [];
        }
    }

    async searchURL(url: string): Promise<SearchTrackResult | null> {
        logger.info(url);
        return null;
    }

    async getTrackUrl(trackId: string): Promise<string> {
        if (!trackId) {
            logger.error("Error getting track URL: videoId is undefined");
            return '';
        }

        try {
            const url = `https://music.youtube.com/watch?v=${trackId}`;
            const info = await ytdl.getInfo(url);
            const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
            
            if (audioFormat && audioFormat.url) {
                logger.info(`YouTube | Got download URL for video: ${trackId}`);
                logger.warn(audioFormat.url)
                return audioFormat.url;
            } else {
                logger.error(`No suitable audio format found for video: ${trackId}`);
                return '';
            }
        } catch (error) {
            logger.error(`Error getting YouTube audio URL: ${error.message}`);
            return '';
        }
    }
}