// import { Discord } from "discordx";
// import { spotify } from "play-dl"
// import logger from "../../utils/logger.js";
// import { z } from 'zod';

// const SearchTrackResultSchema = z.object({
//     id: z.string().optional(),
//     title: z.string(),
//     artists: z.array(z.object({ name: z.string().min(1) })),
//     albums: z.array(z.object({ title: z.string().optional() })),
//     source: z.string()
// });

// type SearchTrackResult = z.infer<typeof SearchTrackResultSchema>;

// @Discord()
// class SpotifyMusicService {
//     private results?: SearchTrackResult[];

//     hasAvailableResults(): boolean {
//         return !!this.results?.length;
//     }

//     async searchName(trackName: string): Promise<SearchTrackResult[]> {
//         try {
//             const tracks = await spotify.search(trackName, "track");

//             const formattedTracks = tracks?.map(track => ({
//                 id: track.id,
//                 title: track.title,
//                 artists: track.artists.map(artist => ({ name: artist.name })),
//                 albums: track.album ? [{ title: track.album }] : [],
//                 source: 'spotify'
//             })) || [];

//             this.results = formattedTracks.map(track => SearchTrackResultSchema.parse(track));
//             logger.info(`Spotify | Found ${this.results.length} tracks for: ${trackName}`);
//             return this.results;
//         } catch (error) {
//             logger.error(`Error searching for track: ${error}`);
//             return [];
//         }
//     }

//     async getTrackUrl(trackId?: string): Promise<string> {
//         if (!trackId) {
//             logger.error("Error getting track URL: trackId is undefined");
//             return '';
//         }

//         try {
//             const track = await spotify.track(trackId);
//             const trackUrl = track?.url;

//             if (trackUrl) {
//                 return trackUrl;
//             } else {
//                 logger.error(`Track URL not found for ID: ${trackId}`);
//                 return '';
//             }
//         } catch (error) {
//             logger.error(`Error getting Spotify track URL: ${error.message}`);
//             return '';
//         }
//     }
// }

// export { SpotifyMusicService };