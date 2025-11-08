import { AudioPlugin, AudioPluginBaseOptions } from "fluent-streamer";
import { Transform } from "stream";

/**
 * Simple dynamic range compressor.
 * Limits peaks above threshold.
 */
export class CompressorPlugin implements AudioPlugin {
  constructor(
    private threshold = 0.8,
    private ratio = 4,
  ) {}

  setParams(threshold: number, ratio: number) {
    this.threshold = threshold;
    this.ratio = ratio;
  }

  createTransform(options: Required<AudioPluginBaseOptions>): Transform {
    const { channels } = options;
    const t = new Transform({
      transform: (chunk: Buffer, _enc, cb) => {
        try {
          const samples = new Int16Array(
            chunk.buffer,
            chunk.byteOffset,
            chunk.length / 2,
          );
          for (let i = 0; i < samples.length; i += channels) {
            for (let c = 0; c < channels; c++) {
              const idx = i + c;
              let val = samples[idx] / 32768;
              const abs = Math.abs(val);
              if (abs > this.threshold) {
                val =
                  Math.sign(val) *
                  (this.threshold + (abs - this.threshold) / this.ratio);
              }
              samples[idx] = Math.round(Math.max(-1, Math.min(1, val)) * 32767);
            }
          }
          cb(null, chunk);
        } catch (e) {
          cb(e as Error);
        }
      },
    }) as Transform & { _threshold: number; _ratio: number };

    t._threshold = this.threshold;
    t._ratio = this.ratio;
    return t;
  }
}
