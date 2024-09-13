// yandex_music_api.ts

import axios from 'axios';

export async function getTrackUrl(userId: string, playlistId: string) {
  try {
    const response = await axios.get(`https://api.music.yandex.net/tracks/${playlistId}/download-info`);
    console.log('API Response:', response.data);
    const trackData = response.data.result[0];
    return `https://music.yandex.ru/iframe/#track/${trackData.trackId}`;
  } catch (error) {
    console.error('Error fetching track URL:');
    throw error;
  }
}