import { EventEmitter } from "node:events";
import { Transform, PassThrough, Readable } from "node:stream";
import { StreamType } from "@discordjs/voice";
import { FluentStream } from "../../../../fluent-streamer/dist/index.js";
import type { AudioProcessingOptions } from "../../types/audio.js";
import {
  DEFAULT_VOLUME,
  DEFAULT_BASS,
  DEFAULT_TREBLE,
  DEFAULT_COMPRESSOR,
  DEFAULT_NORMALIZE,
} from "../../utils/constants.js";
import { VolumePlugin } from "./plugins/VolumePlugin.js";
import { BassPlugin } from "fluent-streamer";

// Простая функция-транслятор тишины (например, для "хвоста" потока)
function createSilence(frames = 5) {
  const frame = Buffer.alloc(3840, 0); // 20 мс тишины при 48кГц stereo, 16bit
  const stream = new Readable({
    read() {
      for (let i = 0; i < frames; i++) this.push(frame);
      this.push(null);
    }
  });
  return stream;
}

export class AudioService extends EventEmitter {
  private ffmpeg?: FluentStream;
  private currentOptions: Required<AudioProcessingOptions>;
  private _fadeInterval?: NodeJS.Timeout;

  constructor(options: Partial<AudioProcessingOptions> = {}) {
    super();
    this.currentOptions = {
      volume: DEFAULT_VOLUME,
      bass: DEFAULT_BASS,
      treble: DEFAULT_TREBLE,
      compressor: DEFAULT_COMPRESSOR,
      normalize: DEFAULT_NORMALIZE,
      headers: {},
      lowPassFrequency: 0,
      lowPassQ: 1.0,
      fade: { fadein: 3000, fadeout: 3000 },
      ...options,
    };
  }

  /**
   * Создаёт поток PCM-RAW для проигрывания в Discord с минимальной задержкой.
   */
  async createAudioStreamForDiscord(
    url: string,
    options?: Partial<AudioProcessingOptions>
  ): Promise<{ stream: Transform; type: StreamType }> {
    if (options) Object.assign(this.currentOptions, options);

    await this.destroy();

    // Регистрируем плагины, если ещё нет
    if (!FluentStream.hasPlugin("volume")) {
      FluentStream.registerPlugin("volume", (opts: { volume: number }) => new VolumePlugin(opts));
    }
    if (!FluentStream.hasPlugin("bass")) {
      FluentStream.registerPlugin("bass", (opts: { bass: number }) => new BassPlugin(opts));
    }

    // Сборка плагинов (в будущей доработке можно расширить эквалайзер и т.д.)
    const plugins = [
      { name: "volume", options: { volume: this.currentOptions.volume } },
      { name: "bass", options: { bass: this.currentOptions.bass } }
    ];

    this.ffmpeg = new FluentStream({ debug: true });

    if (this.currentOptions.headers && Object.keys(this.currentOptions.headers).length > 0) {
      this.ffmpeg.setHeaders(this.currentOptions.headers);
    }

    // ВАЖНО: "volume=0.10" здесь жёстко захардкожен, как в логе ffmpeg
    this.ffmpeg
      .input(url)
      .inputOptions(
        "-fflags", "nobuffer",
        "-flags", "low_delay",
        "-probesize", "32",
        "-analyzeduration", "0"
      )
      .audioCodec("pcm_s16le")
      .outputOptions(
        "-f", "s16le", 
        "-ar", "48000", 
        "-ac", "2",
        "-af", "volume=0.10"
      )
      .output("pipe:1");

    // Используем плагины, если нужно (оставил конструкцию для совместимости)
    this.ffmpeg.usePlugins(enc => enc, ...plugins);

    const { output, done } = this.ffmpeg.run();
    const passthrough = new PassThrough();

    // Перекачиваем данные через буфер-выход (с небольшой буферизацией, как require Discord)
    output.on("data", (chunk) => passthrough.write(chunk));

    output.on("end", () => {
      // Вставляем короткую паузу-тишину для "чистого конца"
      const silence = createSilence();
      silence.pipe(passthrough, { end: false });
      silence.on("end", () => passthrough.end());
    });

    output.on("error", (err) => {
      this.emit("error", err);
      passthrough.destroy(err);
    });

    done.catch(err => this.emit("error", err));
    this.emit("debug", `[AudioService] Stream created for ${url}`);

    return { stream: passthrough, type: StreamType.Raw };
  }

  // ==================== CONTROL ====================
  async setVolume(targetVolume: number, duration = 200): Promise<void> {
    if (this._fadeInterval) clearInterval(this._fadeInterval);

    const startVolume = this.currentOptions.volume;
    const steps = Math.max(1, Math.floor(duration / 50));
    const stepVolume = (targetVolume - startVolume) / steps;
    let currentStep = 0;

    this._fadeInterval = setInterval(() => {
      currentStep++;
      const newVolume = startVolume + stepVolume * currentStep;
      this.currentOptions.volume = Math.min(Math.max(newVolume, 0), 1);

      if (this.ffmpeg) {
        void this.ffmpeg.updatePlugins({ name: "volume", options: { volume: this.currentOptions.volume } });
      }
      this.emit("volumeChanged", this.currentOptions.volume * 100);

      if (currentStep >= steps) {
        clearInterval(this._fadeInterval);
        this._fadeInterval = undefined;
      }
    }, 50);
  }

  setVolumeFast(volume: number): void {
    this.currentOptions.volume = volume;
    if (this.ffmpeg) {
      void this.ffmpeg.updatePlugins({ name: "volume", options: { volume } });
    }
    this.emit("volumeChanged", volume * 100);
  }

  setBass(bass: number): void {
    this.currentOptions.bass = bass;
    if (this.ffmpeg) {
      void this.ffmpeg.updatePlugins({ name: "equalizer", options: { bass, treble: this.currentOptions.treble } });
    }
    this.emit("equalizerChanged", this.currentOptions);
  }

  setTreble(treble: number): void {
    this.currentOptions.treble = treble;
    if (this.ffmpeg) {
      void this.ffmpeg.updatePlugins({ name: "equalizer", options: { bass: this.currentOptions.bass, treble } });
    }
    this.emit("equalizerChanged", this.currentOptions);
  }

  setCompressor(enabled: boolean): void {
    this.currentOptions.compressor = enabled;
    if (this.ffmpeg) {
      void this.ffmpeg.updatePlugins({ name: "compressor", options: { active: enabled } });
    }
    this.emit("compressorChanged", enabled);
  }

  setNormalize(enabled: boolean): void {
    this.currentOptions.normalize = enabled;
    if (this.ffmpeg) {
      void this.ffmpeg.updatePlugins({ name: "normalize", options: { active: enabled } });
    }
    this.emit("normalizeChanged", enabled);
  }

  async fadeIn(duration = 2000): Promise<void> {
    const targetVolume = this.currentOptions.volume;
    let current = 0;
    const steps = Math.max(1, Math.floor(duration / 50));
    const step = targetVolume / steps;

    const interval = setInterval(() => {
      current += step;
      if (current >= targetVolume) {
        current = targetVolume;
        clearInterval(interval);
      }
      void this.setVolume(current);
    }, 50);
  }

  // ==================== CLEANUP ====================
  async destroy(): Promise<void> {
    try {
      if (this.ffmpeg) {
        this.ffmpeg.removeAllListeners();
        this.ffmpeg = undefined;
      }
      this.emit("debug", "[AudioService] Stream destroyed");
    } catch (e) {
      this.emit("debug", `[AudioService] Destroy failed: ${(e as Error).message}`);
    }
  }
}
