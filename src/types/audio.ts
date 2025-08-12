import { Track } from "./index.js";

export interface AudioProcessingOptions {
	volume: number;
	bass: number;
	treble: number;
	compressor: boolean;
	normalize: boolean;
	lowPassFrequency?: number;
	lowPassQ?: number;
	fade?: {
		fadein: number;
		fadeout: number;
	};
}

export interface PlayerState {
	connection: any;
	isPlaying: boolean;
	channelId: string | null;
	volume: number;
	currentTrack: Track | null;
	nextTrack: Track | null;
	loop: boolean;
	pause: boolean;
	wave: boolean;
	lowPassFrequency: number;
	lowPassQ: number;
	compressor: boolean;
	normalize: boolean;
	bass: number;
}

export enum PlayerServiceEvents {
	PLAYING = "playing",
	PAUSED = "paused",
	TRACK_STARTED = "trackStarted",
	TRACK_ENDED = "trackEnded",
	QUEUE_EMPTY = "queueEmpty",
	ERROR = "error",
	VOLUME_CHANGED = "volumeChanged",
	EQUALIZER_CHANGED = "equalizerChanged",
	LOWPASS_CHANGED = "lowPassChanged",
	LOOP_CHANGED = "loopChanged",
	CROSSFADE_COMPLETED = "crossfadeCompleted",
	CONNECTED = "connected",
	DISCONNECTED = "disconnected",
	TRACK_QUEUED = "trackQueued",
}

export interface AudioEffectConfig {
	volume: number;
	bass: number;
	treble: number;
	compressor: boolean;
	lowPassFrequency: number;
	lowPassQ: number;
	normalize: boolean;
}
