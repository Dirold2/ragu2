import { AudioPlugin, AudioPluginBaseOptions } from "fluent-streamer";
import { Transform } from "stream";

export interface VolumePluginOptions extends AudioPluginBaseOptions {
  volume: number;
}

export class VolumePlugin implements AudioPlugin<VolumePluginOptions> {
  private options: Required<VolumePluginOptions>;

  constructor(options: VolumePluginOptions) {
    this.options = { sampleRate: 48000, channels: 2, ...options };
  }

  setOptions(options: Partial<VolumePluginOptions>) {
    this.options = { ...this.options, ...options };
  }

  getOptions(): Required<VolumePluginOptions> {
    return this.options;
  }

  createTransform(options: Required<VolumePluginOptions>): Transform {
    const { channels, volume } = options;
    const t = new Transform({
      transform: (chunk: Buffer, _enc, cb) => {
        try {
          const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2);

          for (let i = 0; i < samples.length; i += channels) {
            for (let c = 0; c < channels; c++) {
              const idx = i + c;
              let val = samples[idx] / 32768;
              val *= volume;
              samples[idx] = Math.round(Math.max(-1, Math.min(1, val)) * 32767);
            }
          }
          cb(null, chunk);
        } catch (e) {
          cb(e as Error);
        }
      },
    }) as Transform & { _volume: number };

    t._volume = volume;
    return t;
  }
}
