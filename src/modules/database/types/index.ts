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
