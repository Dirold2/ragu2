import { SearchTrackResult } from "../types/index.js";

export interface MusicServicePlugin {
	name: string;
	urlPatterns: RegExp[];
	searchName(trackName: string): Promise<SearchTrackResult[]>;
	searchURL(url: string): Promise<SearchTrackResult[] | undefined>;
	getTrackUrl(trackId: string): Promise<string>;
	getPlaylistURL?(url: string): Promise<SearchTrackResult[] | null>;
	getRecommendations?(trackId: string): Promise<SearchTrackResult[]>;
	includesUrl?(url: string): Promise<boolean>;
}

export interface Track {
	info: string;
	source: string;
	trackId: string;
	addedAt?: bigint;
	priority?: boolean;
	waveStatus?: boolean;
	requestedBy?: string;
}

export interface QueueResult {
	tracks: Track[];
	lastTrackId?: string;
	waveStatus?: boolean;
	volume?: number;
}

export interface PlaylistTrack {
	id: number;
	track: {
		id: number;
		title: string;
		artists: Array<{ name: string }>;
		albums: Array<{ title: string }>;
		durationMs: number;
		coverUri: string;
	};
}
