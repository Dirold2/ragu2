import { AudioPlugin, AudioPluginBaseOptions } from "fluent-streamer";
import { Transform } from "stream";

/**
 * Bass boost plugin.
 * Simple IIR-style bass boost on stereo PCM audio.
 */
export class BassPlugin implements AudioPlugin {
  constructor(private bass: number) {}

  setBass(b: number) {
    this.bass = b;
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
              // Simple bass amplification for demonstration
              val = val * (1 + this.bass * 0.5);
              samples[idx] = Math.round(Math.max(-1, Math.min(1, val)) * 32767);
            }
          }
          cb(null, chunk);
        } catch (e) {
          cb(e as Error);
        }
      },
    }) as Transform & { _bass: number };

    t._bass = this.bass;
    return t;
  }
}
