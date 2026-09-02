import createLogger from "dlog2";
import type { MusicServicePlugin } from "../interfaces/index.js";
import type { SearchTrackResult } from "../types/index.js";
import { HITApi } from "hitd2";

export default class HitmoMusicPlugin implements MusicServicePlugin {
  name = "hitmos";
  urlPatterns = [
    /(?:^|\.)hitmos\.(?:me|fm)(?:\/|$)/,
    /(?:^|\.)hitmoz\.org(?:\/|$)/,
  ];

  private api: HITApi;
  private readonly sourceUrls = new Map<string, string>();
  public logger = createLogger(this.name);

  constructor(sessionCookie?: string) {
    this.api = new HITApi({ sessionCookie });
  }

  async initialize() {
    this.logger.info(`Plugin ${this.name} Initialized`);
  }

  /**
   * Поиск трека по названию.
   * Возвращает массив результатов поиска в общем формате SearchTrackResult.
   */
  async searchName(trackName: string): Promise<SearchTrackResult[]> {
    try {
      const tracks = await this.api.search(trackName, 10);

      return tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artists: [{ name: track.artist || "Unknown" }],
        albums: undefined,
        durationMs: track.duration > 0 ? track.duration * 1000 : undefined,
        cover: undefined,
        source: this.name,
        url: undefined,
        generation: false,
      }));
    } catch (error) {
      console.error(
        `[Plugin:${this.name}] Search failed for "${trackName}":`,
        error,
      );
      return [];
    }
  }

  async searchURL(url: string): Promise<SearchTrackResult[]> {
    try {
      const meta = await this.api.getTrackByUrl(url);
      this.sourceUrls.set(meta.id, url);

      return [
        {
          id: meta.id,
          title: meta.title,
          artists: [{ name: meta.artist || "Unknown" }],
          albums: undefined,
          durationMs: meta.duration > 0 ? meta.duration * 1000 : undefined,
          cover: undefined,
          source: this.name,
          url: undefined,
          generation: false,
        },
      ];
    } catch (error) {
      console.error(
        `[Plugin:${this.name}] URL processing failed for "${url}":`,
        error,
      );
      return [];
    }
  }

  async getTrackUrl(trackId: string): Promise<string> {
    const sourceUrl = this.sourceUrls.get(trackId);
    const audio = sourceUrl
      ? await this.api.getAudioByUrl(sourceUrl)
      : await this.api.getAudio(trackId);
    if (!audio.url) {
      throw new Error("Audio URL is empty");
    }
    return audio.url;
  }
}
