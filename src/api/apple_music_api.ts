// apple_music_api.js

import axios from 'axios';

export async function getTrackUrl(userId: string, trackId: string) {
  const response = await axios.get(`https://music.apple.com/us/album/${trackId}/tracks`);
  return response.data[0].preview_url;
}