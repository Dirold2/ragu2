import { AudioPlugin, AudioPluginBaseOptions } from "fluent-streamer";
import { Transform } from "stream";

export class DistortionPlugin implements AudioPlugin {
  constructor(private gain: number = 1.0) {}

  setGain(g: number) {
    this.gain = g;
  }

  createTransform(options: Required<AudioPluginBaseOptions>): Transform {
    const { channels } = options;
    const t = new Transform({
      transform: (chunk: Buffer, _enc, cb) => {
        try {
          const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2);

          for (let i = 0; i < samples.length; i += channels) {
            for (let c = 0; c < channels; c++) {
              const idx = i + c;
              let val = samples[idx] / 32768 * this.gain;

              // Простейшая волновая форма клиппинга
              if (val > 0.4) val = 0.4;
              else if (val < -0.4) val = -0.4;

              samples[idx] = Math.round((val / 0.4) * 32767);
            }
          }
          cb(null, chunk);
        } catch (e) {
          cb(e as Error);
        }
      },
    }) as Transform & { _gain: number };

    t._gain = this.gain;
    return t;
  }
}
