import { z } from "zod";

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
  durationMs: z.number().int().nonnegative().optional(),

  // Раньше было: z.string().url().optional() → ловило Invalid URL на cover
  cover: z.string().optional(),

  source: z.string(),

  // Здесь оставляем строгий URL, т.к. это реальный проигрываемый URL
  url: z.string().url().optional(),

  items: z.string().optional(),
  generation: z.boolean().default(false),
});

export type SearchTrackResult = z.infer<typeof TrackResultSchema>;

export const TrackSchema = z.object({
  trackId: z.string(),
  addedAt: z.bigint().optional(),
  info: z.string(),
  url: z.string().url().optional(),
  source: z.string(),
  waveStatus: z.boolean().optional(),
  requestedBy: z.string().optional(),
  priority: z.boolean().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  stationId: z.string().optional(),
  generation: z.boolean().default(false),
});

export type Track = z.infer<typeof TrackSchema>;

export const ConfigSchema = z.object({
  access_token: z.string(),
  uid: z.number().int(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
