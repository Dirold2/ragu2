import { AudioResource, StreamType, VoiceConnection } from "@discordjs/voice";
import { z } from "zod";

// Define schema for individual track search result
export const TrackResultSchema = z.object({
	id: z.string(),
	title: z.string(),
	artists: z.array(
		z.object({
			name: z.string(),
		}),
	),
	albums: z
		.array(
			z.object({
				title: z.string().optional(),
			}),
		)
		.optional(),
	duration: z.string().optional(),
	cover: z.string().optional(),
	source: z.string(),
	url: z.string().optional(),
	items: z.string().optional(),
});

// Type definition inferred from the TrackResultSchema
export type SearchTrackResult = z.infer<typeof TrackResultSchema>;

// Define schema for a track, including optional fields
export const TrackSchema = z.object({
	trackId: z.string(),
	addedAt: z.bigint().optional(),
	info: z.string(),
	url: z.string().optional(),
	source: z.string(),
	waveStatus: z.boolean().optional(),
	requestedBy: z.string().optional(),
	priority: z.boolean().optional(),
});

// Type definition inferred from the TrackSchema
export type Track = z.infer<typeof TrackSchema>;

// Define schema for configuration settings
export const ConfigSchema = z.object({
	access_token: z.string(),
	uid: z.number(),
});

// Type definition inferred from the ConfigSchema
export type Config = z.infer<typeof ConfigSchema>;

export type PlayerState = {
	connection: VoiceConnection | null;
	isPlaying: boolean;
	resource: AudioResource | null;
	channelId: string | null;
	volume: number;
	currentTrack: Track | null;
	nextTrack: Track | null;
	lastTrack: Track | null;
	loop: boolean;
	wave: boolean;
	preloadedResource?: AudioResource | null;
	nextTrackMetadata?: Track & { url: string; duration: number };
};

export interface WorkerMessage {
	type: string;
	url: string;
	volume: number;
}

export interface ResourceData {
	url: string;
	volume: number;
	inputType: StreamType;
}

export interface Messages {
	[key: string]: string;
}
