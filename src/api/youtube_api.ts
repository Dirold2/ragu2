// youtube_api.ts

import axios from 'axios';

export async function getVideoUrl(videoId: string) {
  const response = await axios.get(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=YOUR_YOUTUBE_API_KEY&part=snippet`);
  return response.data.items[0].snippet.thumbnails.default.url;
}