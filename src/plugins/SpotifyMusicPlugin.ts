import type { MusicServicePlugin } from "../interfaces/index.js";
import type { SearchTrackResult } from "../types/index.js";
import { CacheManager } from "hcacher";
import { SPApi } from "spd2";

type SpotifyOEmbedResponse = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

type SpotifyResource = {
  id: string;
  type: "album" | "artist" | "playlist" | "track";
};

type SpotifyPlaylistTrack = {
  album?: {
    images?: Array<{ url?: string }>;
    name?: string;
  };
  artists?: Array<{ name?: string }>;
  duration_ms?: number;
  id: string;
  name?: string;
};

export default class SpotifyMusicPlugin implements MusicServicePlugin {
  name = "spotify";
  supportsPlayback = false;
  urlPatterns = [
    /open\.spotify\.com\/(track|album|playlist|artist)/,
    /spotify:\/\/(track|album|playlist|artist):/,
  ];

  private api: SPApi | null = null;
  private readonly collectionCache = new CacheManager<SearchTrackResult[]>({
    maxSize: 100,
    ttl: 3600000,
  });

  constructor(private spDc: string = process.env.SPOTIFY_SP_DC || process.env.SP_DC || "") {}

  private async getApi(): Promise<SPApi> {
    if (!this.api) {
      this.api = new SPApi(this.spDc);
      await this.api.initialize();
    }
    return this.api;
  }

  async initialize() {
    if (!this.api) {
      this.api = new SPApi(this.spDc);
      await this.api.initialize();
    }
    return this.api;
  }

  async searchName(query: string): Promise<SearchTrackResult[]> {
    const api = await this.getApi();

    try {
      // Приведение типа any необходимо, так как search может отсутствовать в строгом интерфейсе SPApi
      const result: any = await (api as any).search(query, 10);

      const tracks: SearchTrackResult[] =
        result.tracks?.map((track: any) => {
          const trackId = (api as any).extractId(track.uri) || "";

          let artistsArray: { name: string }[] = [{ name: "Unknown" }];
          if (Array.isArray(track.artists)) {
            artistsArray = track.artists.map((a: any) => ({ name: a.name || "Unknown" }));
          } else if (typeof track.artists === "string") {
            artistsArray = [{ name: track.artists }];
          } else if (track.artists?.name) {
            artistsArray = [{ name: track.artists.name }];
          }

          return {
            id: trackId,
            title: track.name || "Unknown",
            artists: artistsArray,
            source: "spotify",
            generation: false,
            durationMs: track.duration?.totalMilliseconds || 0,
            cover: track.albumOfTrack?.coverArt?.images?.[1]?.url || "",
            url: trackId ? `https://open.spotify.com/track/${trackId}` : "https://open.spotify.com",
            albums: [{ title: track.albumOfTrack?.name || "" }],
            explicit: track.contentRating?.label === "EXPLICIT",
          };
        }) || [];

      return tracks;
    } catch (error) {
      console.error("Spotify search error:", error);
      return [];
    }
  }

  async includesUrl(url: string): Promise<boolean> {
    const type = this.extractSpotifyResource(url)?.type;
    return type === "album" || type === "playlist";
  }

  async searchURL(url: string): Promise<SearchTrackResult[]> {
    const resource = this.extractSpotifyResource(url);
    if (!resource) return [];

    const api = await this.getApi();

    if (resource.type === "playlist" || resource.type === "album") {
      try {
        return resource.type === "playlist"
          ? await this.getPlaylistTracks(resource.id)
          : await this.getAlbumTracks(resource.id);
      } catch (error) {
        console.warn(
          `Spotify ${resource.type} metadata is unavailable for ${resource.id}: ${(error as Error).message}`,
        );
        return [];
      }
    }

    if (resource.type !== "track") return [];

    try {
      const track = await api.getTrack(resource.id);

      return [
        {
          id: track.id,
          title: track.name || "Unknown",
          artists: track.artists.map((artist) => ({ name: artist.name || "Unknown" })),
          source: this.name,
          generation: false,
          durationMs: track.duration_ms || 0,
          cover: track.album.images[1]?.url || track.album.images[0]?.url || "",
          url: `https://open.spotify.com/track/${resource.id}`,
          albums: [{ title: track.album.name || "" }],
        },
      ];
    } catch (error) {
      const fallbackTrack = await this.getOEmbedTrack(url, resource.id);
      if (fallbackTrack) return [fallbackTrack];

      console.warn(
        `Spotify metadata is unavailable for ${resource.id}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<SearchTrackResult[]> {
    return this.getCollectionTracks("playlist", playlistId);
  }

  async getAlbumTracks(albumId: string): Promise<SearchTrackResult[]> {
    return this.getCollectionTracks("album", albumId);
  }

  async getTrackUrl(trackId: string): Promise<string> {
    const api = await this.getApi();
    try {
      // Используем допустимые значения качества
      const result = await api.getAudio(trackId, { quality: "OGG_VORBIS_320" });
      const urls = result.urls || [];

      if (urls.length === 0) {
        console.warn("No URLs found for track:", trackId);
        return "";
      }

      // Логика выбора лучшего качества адаптирована под структуру ответа spd2
      // Обычно urls содержит объекты { url, quality, ... }
      const bestTrack =
        urls.find((u: any) => u.quality === "FLAC_FLAC") ||
        urls.find((u: any) => u.quality === "OGG_VORBIS_320") ||
        urls.find((u: any) => u.quality === "MP4_256") ||
        urls[0];

      console.log("Selected stream:", bestTrack.quality);

      // Возвращаем прямую ссылку (обычно это поле url или blobUrl)
      return bestTrack?.url || bestTrack?.blobUrl || "";
    } catch (error) {
      console.warn(`Spotify stream unavailable for ${trackId}: ${(error as Error).message}`);
      return "";
    }
  }

  getApiHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://open.spotify.com/",
      Referer: "https://open.spotify.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      "Spotify-App-Version": "1.2.87.27.ga2033a72",
      Cookie: `sp_dc=${this.spDc}`,
    };
  }

  /**
   * Public Spotify endpoint used when authenticated metadata access is unavailable.
   * It supplies enough metadata for TrackManager to resolve audio through another source.
   */
  private async getCollectionTracks(
    type: "album" | "playlist",
    id: string,
  ): Promise<SearchTrackResult[]> {
    const cacheKey = `${type}_${id}`;
    const cachedResults = this.collectionCache.get(cacheKey);
    if (cachedResults) return cachedResults;

    try {
      const api = await this.getApi();
      const tracks =
        type === "playlist" ? await api.getPlaylistTracks(id) : await api.getAlbumTracks(id);
      const results = tracks.map((track) => this.toSearchTrackResult(track));
      this.collectionCache.set(cacheKey, results);
      return results;
    } catch (error) {
      console.warn(
        `Spotify ${type} metadata is unavailable for ${id}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private async getOEmbedTrack(url: string, trackId: string): Promise<SearchTrackResult | null> {
    try {
      const response = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      );
      if (!response.ok) return null;

      const data = (await response.json()) as SpotifyOEmbedResponse;
      const title = data.title?.trim();
      const artist = data.author_name?.trim();
      if (!title) return null;

      return {
        id: trackId,
        title,
        artists: artist ? [{ name: artist }] : [],
        source: this.name,
        generation: false,
        cover: data.thumbnail_url ?? "",
        url: `https://open.spotify.com/track/${trackId}`,
      };
    } catch {
      return null;
    }
  }

  private toSearchTrackResult(track: SpotifyPlaylistTrack): SearchTrackResult {
    return {
      id: track.id,
      title: track.name?.trim() || "Unknown",
      artists: track.artists?.map((artist) => ({ name: artist.name || "Unknown" })) ?? [],
      source: this.name,
      generation: false,
      durationMs: track.duration_ms ?? 0,
      cover: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || "",
      url: `https://open.spotify.com/track/${track.id}`,
      albums: [{ title: track.album?.name || "" }],
    };
  }

  private extractSpotifyResource(url: string): SpotifyResource | null {
    const match =
      url.match(/\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/) ||
      url.match(/spotify:(track|album|playlist|artist):([a-zA-Z0-9]+)/);
    if (!match?.[1] || !match[2]) return null;

    return {
      type: match[1] as SpotifyResource["type"],
      id: match[2],
    };
  }
}
