// yandex_music_api.js

import axios from 'axios';
import { ILogObj, Logger } from "tslog";

const logger: Logger<ILogObj> = new Logger();

export async function getTrackUrl(userId: string, playlistId: string) {
  try {
    const response = await axios.get(`https://api.music.yandex.net/tracks/${playlistId}/download-info`);
    logger.info('API Response:', response.data);
    const trackData = response.data.result[0];
    return `https://music.yandex.ru/iframe/#track/${trackData.trackId}`;
  } catch (error) {
    logger.info('Error fetching track URL:');
    throw error;
  }
}