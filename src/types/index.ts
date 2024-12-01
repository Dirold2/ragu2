import { z } from "zod";

// Define schema for individual track search result
export const TrackResultSchema = z.object({
    id: z.string(),
    title: z.string(),
    artists: z.array(
        z.object({
            name: z.string(),
        })
    ),
    albums: z
        .array(
            z.object({
                title: z.string().optional(),
            })
        )
        .optional(),
    source: z.string(),
});

// Type definition inferred from the TrackResultSchema
export type SearchTrackResult = z.infer<typeof TrackResultSchema>;

// Define schema for a track, including optional fields
export const TrackSchema = z.object({
    trackId: z.string(),
    addedAt: z.bigint().optional(),
    info: z.string(),
    url: z.string().url(),
    source: z.string(),
    waveStatus: z.boolean().optional(),
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