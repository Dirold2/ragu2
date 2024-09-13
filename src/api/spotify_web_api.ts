// spotify_web_api.ts

import axios from 'axios';

export async function getTrackUrl(trackId: string) {
  const response = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, { headers: { Authorization: `Bearer YOUR_SPOTIFY_API_KEY` } });
  return response.data.preview_url;
}