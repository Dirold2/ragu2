// import { Discord } from "discordx";
// import { MusicKit } from "apple-music-api"; // Подключаем типы Apple Music API
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
// class AppleMusicService {
//     private results?: SearchTrackResult[];
//     private musicKit: MusicKit;

//     constructor() {
//         this.musicKit = new MusicKit(); // Инициализация MusicKit
//     }

//     hasAvailableResults(): boolean {
//         return !!this.results?.length;
//     }

//     async searchName(trackName: string): Promise<SearchTrackResult[]> {
//         try {
//             const searchResults = await this.musicKit.api.search(trackName, { types: ['songs'] });
//             const tracks = searchResults.results.songs?.data || [];

//             const formattedTracks = tracks.map(track => ({
//                 id: track.id,
//                 title: track.attributes.name,
//                 artists: [{ name: track.attributes.artistName }],
//                 albums: track.attributes.albumName ? [{ title: track.attributes.albumName }] : [],
//                 source: 'apple'
//             }));

//             this.results = formattedTracks.map(track => SearchTrackResultSchema.parse(track));
//             logger.info(`Apple Music | Found ${this.results.length} tracks for: ${trackName}`);
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
//             const track = await this.musicKit.api.songs(trackId);
//             const trackUrl = track.data[0]?.attributes?.url;

//             if (trackUrl) {
//                 return trackUrl;
//             } else {
//                 logger.error(`Track URL not found for ID: ${trackId}`);
//                 return '';
//             }
//         } catch (error) {
//             logger.error(`Error getting Apple Music track URL: ${error.message}`);
//             return '';
//         }
//     }
// }

// export { AppleMusicService };
