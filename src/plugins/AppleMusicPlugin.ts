import { APMApi, type AppleMusicTrack, type Track as AppleMusicCollectionTrack } from "apmd2";
import createLogger from "dlog2";
import type { MusicServicePlugin } from "../interfaces/index.js";
import type { SearchTrackResult } from "../types/index.js";
import { getErrorMessage } from "../utils/error.js";

type AppleMusicResource =
  | { type: "album"; trackId?: string; url: string }
  | { type: "playlist"; url: string }
  | { type: "track"; url: string };

type AppleMusicSearchTrack = AppleMusicCollectionTrack | AppleMusicTrack;

export default class AppleMusicPlugin implements MusicServicePlugin {
  name = "apple";
  supportsPlayback = false;
  urlPatterns = [/music\.apple\.com\//];

  public logger = createLogger(this.name);
  private readonly api = new APMApi();

  async initialize(): Promise<void> {
    this.logger.info(`Plugin ${this.name} initialized`);
  }

  async searchName(query: string): Promise<SearchTrackResult[]> {
    try {
      const result = await this.api.search(query, {
        storefront: process.env.APPLE_MUSIC_STOREFRONT,
        limit: 10,
      });

      return result.tracks.map((track) => ({
        id: track.appleId,
        title: track.title,
        artists: track.artist ? [{ name: track.artist }] : [],
        source: this.name,
        generation: false,
        url: track.url,
      }));
    } catch (error) {
      this.logger.warn(`[Apple Music] Search failed for "${query}": ${getErrorMessage(error)}`);
      return [];
    }
  }

  async includesUrl(url: string): Promise<boolean> {
    const resource = this.extractResource(url);
    return (
      resource?.type === "playlist" ||
      (resource?.type === "album" && resource.trackId === undefined)
    );
  }

  async searchURL(url: string): Promise<SearchTrackResult[]> {
    const resource = this.extractResource(url);
    if (!resource) return [];

    try {
      if (resource.type === "playlist") {
        const playlist = await this.api.getPlaylist(resource.url);
        return playlist.tracks.map((track) =>
          this.toSearchTrackResult(track, playlist.sourceUrl, playlist.title),
        );
      }

      if (resource.type === "track") {
        const track = await this.api.getTrack(resource.url);
        return [this.toSearchTrackResult(track, track.sourceUrl)];
      }

      const album = await this.api.getAlbum(resource.url);
      if (resource.trackId !== undefined) {
        const track = album.tracks.find((candidate) => candidate.appleId === resource.trackId);
        return track ? [this.toSearchTrackResult(track, url, album.title)] : [];
      }

      return album.tracks.map((track) =>
        this.toSearchTrackResult(track, album.sourceUrl, album.title),
      );
    } catch (error) {
      this.logger.warn(
        `[Apple Music] URL metadata is unavailable for "${url}": ${getErrorMessage(error)}`,
      );
      return [];
    }
  }

  async getTrackUrl(_trackId: string): Promise<null> {
    return null;
  }

  private toSearchTrackResult(
    track: AppleMusicSearchTrack,
    sourceUrl: string,
    albumTitle?: string,
  ): SearchTrackResult {
    const fallbackId = "position" in track ? `${sourceUrl}#${track.position}` : sourceUrl;

    return {
      id: track.appleId ?? fallbackId,
      title: track.title,
      artists: track.artist ? [{ name: track.artist }] : [],
      albums: [{ title: track.album ?? albumTitle ?? "" }],
      durationMs: track.durationMs,
      source: this.name,
      generation: false,
      url: sourceUrl,
    };
  }

  private extractResource(value: string): AppleMusicResource | null {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }

    if (url.hostname !== "music.apple.com" && url.hostname !== "www.music.apple.com") {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.includes("playlist")) {
      return { type: "playlist", url: url.toString() };
    }

    if (segments.includes("song")) {
      return { type: "track", url: url.toString() };
    }

    if (!segments.includes("album")) return null;

    const trackId = url.searchParams.get("i") ?? undefined;
    return { type: "album", trackId, url: url.toString() };
  }
}
