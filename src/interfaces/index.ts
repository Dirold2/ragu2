import { SearchTrackResult } from '../types/index.js';

export interface MusicServicePlugin {
    name: string;
    urlPatterns: RegExp[];
    searchName(trackName: string): Promise<SearchTrackResult[]>;
    searchURL(url: string): Promise<SearchTrackResult | null>;
    getTrackUrl(trackId: string): Promise<string>;
    getPlaylistURL?(url: string): Promise<SearchTrackResult[] | null>;
}

export interface Track {
    url: string;
    info: string;
    source: string;
    trackId: string;
    addedAt?: bigint;
    waveStatus?: boolean;
    requestedBy?: string;
}

export interface TrackYandex {
    id: number | string;
    title: string;
    artists: Array<{ name: string }>;
    albums: Array<{ title?: string }>;
    durationMs: number | undefined;
    coverUri: string | undefined;
}

export interface QueueResult {
    tracks: Track[];
    lastTrackId?: string;
    waveStatus?: boolean;
    volume?: number;
}

export interface TrackInfo {
    trackId: string;
    info: string;
    url: string;
    source: string;
    requestedBy?: string;
}