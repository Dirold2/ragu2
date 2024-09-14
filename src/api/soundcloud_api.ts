// soundcloud_api.js

import axios from 'axios';

export async function getTrackUrl(trackId: string) {
  const response = await axios.get(`https://api.soundcloud.com/resolve?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F${trackId}&client_id=YOUR_SOUNDCLOUD_CLIENT_ID`);
  return response.data.stream_url.replace('stream', 'download');
}