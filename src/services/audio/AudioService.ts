import { EventEmitter } from "eventemitter3";
import { Transform } from "node:stream";
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

export class AudioService extends EventEmitter {
  private ffmpeg!: FluentStream;
  private currentOptions: Required<AudioProcessingOptions>;
  private _fadeInterval?: NodeJS.Timeout;
  private pipelineReady: boolean = false;

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
    this.ffmpeg = new FluentStream({ debug: true, useAudioProcessor: true, disableThrottling: true });
    // синхронизируем начальные значения эффектов
    this.ffmpeg.volume = this.currentOptions.volume;
    this.ffmpeg.bass = this.currentOptions.bass;
    this.ffmpeg.treble = this.currentOptions.treble;
    this.ffmpeg.compressor = this.currentOptions.compressor;
  }

  /**
   * Создаёт поток PCM-RAW для проигрывания в Discord с минимальной задержкой.
   * Плагины больше не используются, только стандартные ffmpeg фильтры/опции.
   */
  async createAudioStreamForDiscord(
    url: string,
    options?: Partial<AudioProcessingOptions>
  ): Promise<{ stream: Transform; type: StreamType }> {
    if (options) Object.assign(this.currentOptions, options);

    // Очищаем предыдущий процесс, если он был
    await this.destroy();

    this.pipelineReady = false;
    this.ffmpeg.clear();

    // Применяем сохраненные параметры эффектов к новому экземпляру FluentStream
    this.ffmpeg.volume = this.currentOptions.volume;
    this.ffmpeg.bass = this.currentOptions.bass;
    this.ffmpeg.treble = this.currentOptions.treble;
    this.ffmpeg.compressor = this.currentOptions.compressor;

    // Устанавливаем заголовки, если заданы
    if (this.currentOptions.headers && Object.keys(this.currentOptions.headers).length > 0) {
      if (typeof (this.ffmpeg).headers === "function") {
        (this.ffmpeg).headers(this.currentOptions.headers);
      } else if (typeof (this.ffmpeg).setHeaders === "function") {
        (this.ffmpeg).setHeaders(this.currentOptions.headers);
      }
    }

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
        "-af", "volume=0.1"
      )
      .output("pipe:1");

    // Запуск процесса
    const { output, done } = this.ffmpeg.run();

    done
      .then(() => {
        this.pipelineReady = true;
        this.emit("debug", `[AudioService] Stream finished for ${url}`);
      })
      .catch((err: Error) => this.emit("error", err));

    this.pipelineReady = true;
    this.emit("debug", `[AudioService] Stream created for ${url} with effects: vol=${this.currentOptions.volume}, bass=${this.currentOptions.bass}, treble=${this.currentOptions.treble}, comp=${this.currentOptions.compressor}`);

    return { stream: output, type: StreamType.Raw };
  }

  // ==================== CONTROL ====================
  /**
   * Изменяет громкость через новый FluentStream API.
   */
  async setVolume(target: number, duration: number = 1000, set: boolean = true) {
    target = Math.max(0, Math.min(1, target));
    if (set) {
      this.currentOptions.volume = target;
    }
    // Используем новый API для плавного изменения громкости
    this.ffmpeg.fadeIn(target, duration);
    this.emit("volumeChanged", target * 100);
  }

  setVolumeFast(volume: number, set: boolean = true): void {
    if (set) {
      this.currentOptions.volume = volume;
    }
    // Сохраняем параметры для следующего запуска, пытаемся изменить на лету если процесс активен
    const changed = this.ffmpeg.changeVolume(volume);
    if (!changed) {
      this.emit("debug", `[AudioService] Volume will be applied on next track: ${volume}`);
    }
    this.emit("volumeChanged", volume * 100);
  }

  setBass(bass: number): void {
    this.currentOptions.bass = bass;
    // Сохраняем параметры для следующего запуска, пытаемся изменить на лету если процесс активен
    const changed = this.ffmpeg.changeBass(bass);
    if (!changed) {
      this.emit("debug", `[AudioService] Bass will be applied on next track: ${bass}`);
    }
    this.emit("equalizerChanged", this.currentOptions);
  }

  setTreble(treble: number): void {
    this.currentOptions.treble = treble;
    // Сохраняем параметры для следующего запуска, пытаемся изменить на лету если процесс активен
    const changed = this.ffmpeg.changeTreble(treble);
    if (!changed) {
      this.emit("debug", `[AudioService] Treble will be applied on next track: ${treble}`);
    }
    this.emit("equalizerChanged", this.currentOptions);
  }

  setCompressor(enabled: boolean): void {
    this.currentOptions.compressor = enabled;
    // Сохраняем параметры для следующего запуска, пытаемся изменить на лету если процесс активен
    const changed = this.ffmpeg.changeCompressor(enabled);
    if (!changed) {
      this.emit("debug", `[AudioService] Compressor will be applied on next track: ${enabled}`);
    }
    this.emit("compressorChanged", enabled);
  }

  setNormalize(enabled: boolean): void {
    this.currentOptions.normalize = enabled;
    this.emit("normalizeChanged", enabled);
  }

  async fadeIn(duration = 2000): Promise<void> {
    if (!this.pipelineReady) {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (!this.pipelineReady) return;
    }

    setTimeout(() => {
      this.emit("volumeChanged", this.currentOptions.volume * 100);
    }, duration);
  }

  // ==================== CLEANUP ====================
  async destroy(): Promise<void> {
    try {
      if (this._fadeInterval) {
        clearInterval(this._fadeInterval);
        this._fadeInterval = undefined;
      }
      this.pipelineReady = false;
      if (this.ffmpeg) {
        this.ffmpeg.removeAllListeners();
      }
      this.emit("debug", "[AudioService] Stream destroyed");
    } catch (e) {
      this.emit(
        "debug",
        `[AudioService] Destroy failed: ${(e as Error).message}`
      );
    }
  }
}
