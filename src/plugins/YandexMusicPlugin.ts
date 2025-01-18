import retry from 'async-retry';
import { Discord } from 'discordx';
import NodeCache from 'node-cache';
import { URL } from 'url';
import { Types, WrappedYMApi, YMApi } from 'ym-api-meowed';

import { MusicServicePlugin, PlaylistTrack, TrackYandex } from '../interfaces/index.js';
import { Config, ConfigSchema, SearchTrackResult, TrackResultSchema } from '../types/index.js';
import { logger } from '../utils/index.js';

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
        const cachedResult = this.cache.get<SearchTrackResult[]>(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }
        return await this.updateCacheInBackground(trackName, cacheKey);
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
            logger.error(`Ошибка обработки URL: ${error instanceof Error ? error.message : String(error)}`);
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
            logger.error(`Ошибка получения URL трека для ID ${trackId}: ${error instanceof Error ? error.message : String(error)}`);
            return '';
        }
    }

    async getPlaylistURL(url: string): Promise<SearchTrackResult[] | null> {
        await this.ensureInitialized();
        try {
            const parsedUrl = new URL(url);
            if (!parsedUrl.hostname.includes('music.yandex.ru')) return null;

            const playlistId = this.extractPlaylistId(parsedUrl);
            if (!playlistId.playlistId || !playlistId.playlistName) {
                logger.warn(`Не удалось извлечь данные плейлиста из URL: ${url}`);
                return null;
            }

            const playlistInfo = await this.api.getPlaylist(Number(playlistId.playlistId), playlistId.playlistName);
            if (!playlistInfo || !playlistInfo.tracks) {
                logger.warn(`Плейлист с ID ${playlistId.playlistId} не найден.`);
                return null;
            }

            logger.info(`Получено ${playlistInfo.tracks.length} треков из плейлиста.`);

            const playlistTracks = playlistInfo.tracks as PlaylistTrack[];
            const tracks: SearchTrackResult[] = playlistTracks.map(track => ({
                id: track.id.toString(),
                title: track.track.title,
                artists: track.track.artists.map((artist: { name: string }) => ({ name: artist.name })),
                albums: track.track.albums.map((album: { title: string }) => ({ title: album.title })),
                duration: `${Math.floor(track.track.durationMs / 60000)}:${Math.floor((track.track.durationMs % 60000) / 1000).toString().padStart(2, '0')}`,
                source: 'yandex',
            }));

            return tracks;
        } catch (error) {
            logger.error(`Ошибка при получении плейлиста: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    clearCache(): void {
        this.cache.flushAll();
        this.results = [];
    }

    getResults(): SearchTrackResult[] {
        return [...this.results];
    }

    private extractTrackId(parsedUrl: URL): string | null {
        const match = parsedUrl.pathname.match(/\/album\/\d+\/track\/(\d+)/);
        return match ? match[1] : null;
    }

    private extractPlaylistId(parsedUrl: URL): { playlistName: string | null, playlistId: string | null } {
        const match = parsedUrl.pathname.match(/\/users\/([^/]+)\/playlists\/(\d+)/);
        return {
            playlistName: match ? match[1] : null,
            playlistId: match ? match[2] : null
        };
    }

    private formatTrackInfo(trackInfo: TrackYandex): SearchTrackResult {
        const durationMinutes = Math.floor((trackInfo.durationMs || 0) / 60000);
        const durationSeconds = Math.floor(((trackInfo.durationMs || 0) % 60000) / 1000).toString().padStart(2, '0');
        return {
            id: trackInfo.id.toString(),
            title: trackInfo.title,
            artists: trackInfo.artists.map(artist => ({ name: artist.name })),
            albums: trackInfo.albums.map(album => ({ title: album.title })),
            duration: `${durationMinutes}:${durationSeconds}`,
            cover: trackInfo.coverUri || '',
            source: 'yandex',
        };
    }

    private validateTrackResult(searchResult: SearchTrackResult): SearchTrackResult | null {
        const validation = TrackResultSchema.safeParse(searchResult);
        if (!validation.success) logger.warn(`Неверные данные трека: ${JSON.stringify(validation.error)}`);
        return validation.success ? validation.data : null;
    }

    private loadConfig(): Config {
        const access_token = process.env.YM_API_KEY;
        const uid = Number(process.env.YM_USER_ID);
        if (!access_token || isNaN(uid)) throw new Error("YM_API_KEY и YM_USER_ID должны быть определены.");

        const config = { access_token, uid };
        const validation = ConfigSchema.safeParse(config);
        if (!validation.success) throw new Error(`Неверная конфигурация: ${validation.error.errors.map(err => err.message).join(', ')}`);
        return validation.data;
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            try {
                const config = this.loadConfig();
                await Promise.all([this.wrapper.init(config), this.api.init(config)]);
                this.initialized = true;
            } catch (error) {
                logger.error(`Ошибка инициализации API: ${error instanceof Error ? error.message : String(error)}`);
                throw new Error("Не удалось инициализировать YandexService");
            }
        }
    }

    private async updateCacheInBackground(trackName: string, cacheKey: string): Promise<SearchTrackResult[]> {
        try {
            const result = await retry(() => this.api.searchTracks(trackName), { retries: 3 });
            if (!result?.tracks?.results) {
                return [];
            }

            const validatedTracks = result.tracks.results
                .map((track: TrackYandex) => this.formatTrackInfo(track))
                .filter((track: SearchTrackResult) => TrackResultSchema.safeParse(track).success);

            this.cache.set(cacheKey, validatedTracks);
            this.results = validatedTracks;
            return validatedTracks;
        } catch (error) {
            logger.error(`Ошибка поиска трека: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
}