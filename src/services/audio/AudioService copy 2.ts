import { FluentStream } from 'fluent-streamer';
import { EventEmitter } from "eventemitter3";
import { type Readable, type Transform } from "stream";
import { StreamType } from "@discordjs/voice";
// import { AudioProcessor } from "./AudioProcessor.js";
// import { detectAudioFormat } from "../../utils/audioFormat.js";
import type { AudioProcessingOptions } from "../../types/audio.js";
import {
  DEFAULT_VOLUME,
  DEFAULT_BASS,
  DEFAULT_TREBLE,
  DEFAULT_COMPRESSOR,
  DEFAULT_NORMALIZE,
} from "../../utils/constants.js";
import { AudioProcessor } from './AudioProcessor.js';
// import { safeRequestStream } from "../../utils/safeRequestStreamHttp.js";
// import https from "https";

// const REQUEST_CONFIG = {
//   HEADERS_TIMEOUT: 15000,
//   BODY_TIMEOUT: 30000,
//   STREAM_TIMEOUT: 120000,
//   MAX_REDIRECTS: 5,
//   MAX_RETRIES: 3,
//   RETRY_DELAY: 1000,
// } as const;

export class AudioService extends EventEmitter {
  private processor!: AudioProcessor;
  private currentInputStream: Readable | null = null;
  private currentOptions: AudioProcessingOptions;

  constructor(options: Partial<AudioProcessingOptions> = {}) {
    super();
    this.currentOptions = {
      volume: DEFAULT_VOLUME,
      bass: DEFAULT_BASS,
      treble: DEFAULT_TREBLE,
      compressor: DEFAULT_COMPRESSOR,
      normalize: DEFAULT_NORMALIZE,
      ...options,
    };
  }

  // ==================== Volume ====================

  async setVolume(volume: number, duration = 2000, persist = true): Promise<void> {
    if (persist) this.currentOptions.volume = volume;
    if (this.processor) {
      this.processor.startFade(volume, duration);
      this.emit("volumeChanged", volume * 100);
    }
  }

  setVolumeFast(volume: number, persist = false): void {
    if (persist) this.currentOptions.volume = volume;
    if (this.processor) {
      this.processor.setVolume(volume);
      this.emit("volumeChanged", volume * 100);
    }
  }

  async fadeIn(): Promise<void> {
    if (!this.processor) return;
    this.setVolumeFast(0, false);
    this.processor.startFade(this.currentOptions.volume, this.currentOptions.fade?.fadein ?? 3000);
    this.emit("volumeChanged", this.currentOptions.volume * 100);
  }

  // ==================== EQ / Filters ====================

  setBass(bass: number): void {
    this.currentOptions.bass = bass;
    if (this.processor) {
      this.processor.setEqualizer(this.currentOptions.bass, this.currentOptions.treble, this.currentOptions.compressor);
      this.emit("equalizerChanged", {
        bass: this.currentOptions.bass,
        treble: this.currentOptions.treble,
        compressor: this.currentOptions.compressor,
        normalize: this.currentOptions.normalize,
      });
    }
  }

  setTreble(treble: number): void {
    this.currentOptions.treble = treble;
    if (this.processor) {
      this.processor.setEqualizer(this.currentOptions.bass, this.currentOptions.treble, this.currentOptions.compressor);
      this.emit("equalizerChanged", {
        bass: this.currentOptions.bass,
        treble: this.currentOptions.treble,
        compressor: this.currentOptions.compressor,
        normalize: this.currentOptions.normalize,
      });
    }
  }

  setCompressor(enabled: boolean): void {
    this.currentOptions.compressor = enabled;
    if (this.processor) {
      this.processor.setCompressor(enabled);
      this.emit("compressorChanged", enabled);
    }
  }

  setLowPassFrequency(frequency?: number): void {
    this.currentOptions.lowPassFrequency = frequency;
    this.emit("lowPassChanged", frequency);
  }

  // ==================== Streams ====================

  async createAudioStreamFromUrl(url: string, options?: Partial<AudioProcessingOptions>): Promise<Transform> {
    await this.destroyCurrentStreamSafe().catch(() => {});
    if (options) this.currentOptions = { ...this.currentOptions, ...options };

    // const inputFormat = await this.detectInputFormat(url, options?.headers);

    const inputFormat = "mp3"

    // Горячий процессор (JS Transform)
    // this.processor = new AudioProcessor(this.currentOptions);
    await this.fadeIn();

    // FFmpeg: URL -> decode -> AudioProcessor (PCM) -> encode PCM s16le -> pipe:1
    return this.createProcessedStream(url, inputFormat);
  }

  async createAudioStreamForDiscord(
    url: string,
    options?: Partial<AudioProcessingOptions>
  ): Promise<{ stream: Transform; type: StreamType }> {
    // const inputFormat = await this.detectInputFormat(url, options?.headers);

    try {
      // Passthrough для готовых контейнеров Opus
      // if (inputFormat === "opus" || inputFormat === "ogg") {
      //   const body = (await safeRequestStream(url, { method: "GET", headers: options?.headers })) as Readable;
      //   return { stream: body as any, type: StreamType.OggOpus };
      // }
      // if (inputFormat === "webm") {
      //   const body = (await safeRequestStream(url, { method: "GET", headers: options?.headers })) as Readable;
      //   return { stream: body as any, type: StreamType.WebmOpus };
      // }

      const processed = await this.createAudioStreamFromUrl(url, options);
      return { stream: processed, type: StreamType.Raw };
    } catch (err) {
      this.handleStreamError(err as Error, url);
      throw err;
    }
  }

  // ==================== Headers ====================

  // private async fetchHeadersWithRedirects(
  //   url: string,
  //   maxRedirects = REQUEST_CONFIG.MAX_REDIRECTS,
  //   headers?: Record<string, string>
  // ): Promise<Record<string, string | string[] | undefined>> {
  //   let current = url;
  //   for (let i = 0; i < maxRedirects; i++) {
  //     const res = await new Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
  //       const req = https.request(current, { method: "HEAD", headers }, (res) =>
  //         resolve({ statusCode: res.statusCode || 0, headers: res.headers as Record<string, string | string[] | undefined> })
  //       );
  //       req.on("error", reject);
  //       req.end();
  //     });

  //     if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
  //       const location = Array.isArray(res.headers.location) ? res.headers.location[0] : res.headers.location;
  //       if (!location) break;
  //       current = location.startsWith("http") ? location : new URL(location, current).toString();
  //       continue;
  //     }

  //     return res.headers;
  //   }

  //   throw new Error(`Too many redirects for ${url}`);
  // }

  // private async detectInputFormat(url: string, headers?: Record<string, string>): Promise<string | undefined> {
  //   try {
  //     const responseHeaders = await this.fetchHeadersWithRedirects(url, REQUEST_CONFIG.MAX_REDIRECTS, headers);
  //     const mimeType = this.extractMimeType(responseHeaders);
  //     return detectAudioFormat(mimeType, url);
  //   } catch (error) {
  //     this.emit("debug", `Failed to detect format: ${(error as Error).message}`);
  //     return undefined;
  //   }
  // }

  // private extractMimeType(headers: Record<string, string | string[] | undefined>): string | undefined {
  //   const contentType = headers["content-type"];
  //   if (typeof contentType === "string") return contentType;
  //   if (Array.isArray(contentType)) return contentType[0];
  //   return undefined;
  // }

  // ==================== Error handling ====================

  private handleStreamError(error: Error, url: string): void {
    const msg = `Stream error for ${url}: ${error.message}`;
    this.emit("error", new Error(msg));
    this.emit("debug", msg);
  }

  async destroyCurrentStreamSafe(): Promise<void> {
    this.currentInputStream?.destroy();
    this.currentInputStream = null;

    if (this.processor) {
      this.processor.removeAllListeners();
      this.processor.end();
    }
  }

  async destroy(): Promise<void> {
    // this.processor = null;
    // this.removeAllListeners();
  }

  // ==================== FFmpeg + AudioProcessor pipeline ====================

  private async createProcessedStream(_url: string, _inputFormat?: string): Promise<Transform> {
    if (!this.processor) this.processor = new AudioProcessor(this.currentOptions);

    const ff = new FluentStream()
      .withAudioTransform(this.processor, (enc) => {
        enc.input("/home/dirold2/dev/git/ragu2/src/services/audio/320.mp3")
        .inputOptions("-fflags", "nobuffer")
        .inputOptions("-flags", "low_delay")
        .inputOptions("-probesize", "32")
        .inputOptions("-analyzeduration", "0")
        .inputOptions("-f", "mp3")
        .audioCodec('pcm_s16le')
        // .usePlugins('volume', 'bass')
        .outputOptions('-f', 's16le', '-ar', '48000', '-ac', '2')
        .output('pipe:1');
      })

    const { output, done } = ff.run();
    done.catch((err) => this.emit('error', err));
    // this.emit('streamCreated', this.processor);

    // Возвращаем выход FFmpeg; управление громкостью/эквалайзером — через this.processor.*
    return output;
  }
}