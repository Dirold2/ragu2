// SCHEMA TYPE
export { TrackSchema, TrackResultSchema } from "../types/index.js";
// TYPE
export type { Track, SearchTrackResult } from "../types/index.js";

// SERVICE
export { default as CommandService } from "./CommandService.js";
export { default as PlayerService } from "./player/PlayerService.js";
export { default as PlayerManager } from "./player/PlayerManager.js";
export { default as PluginManager } from "./PluginManager.js";
export { default as NameService } from "./NameService.js";
export { default as CacheQueueService } from "./CacheQueueService.js";

// Типы и интерфейсы для PlayerService и AudioService
export interface PlayerState {
	connection: import("@discordjs/voice").VoiceConnection | null;
	isPlaying: boolean;
	channelId: string | null;
	volume: number;
	currentTrack: import("../types/index.js").Track | null;
	nextTrack: import("../types/index.js").Track | null;
	loop: boolean;
	pause: boolean;
	wave: boolean;
	lowPassFrequency: number;
	lowPassQ: number;
}

export interface AudioProcessingOptions {
	volume: number;
	bass: number;
	treble: number;
	compressor: boolean;
	normalize: boolean;
	lowPassFrequency?: number;
}
