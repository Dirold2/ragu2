import config from "../../config.json" with { type: "json" };
import ms from "ms";

// Audio processing limits
export const VOLUME_MIN = config.volume.min ?? 0;
export const VOLUME_MAX = config.volume.max ?? 1;
export const BASS_MIN = config.equalizer.bass_min ?? -20;
export const BASS_MAX = config.equalizer.bass_max ?? 20;
export const TREBLE_MIN = config.equalizer.treble_min ?? -20;
export const TREBLE_MAX = config.equalizer.treble_max ?? 20;

// Fade settings
export const DEFAULT_FADEOUT = config.fade.fadeout_before_end ?? ms("3s");
export const DEFAULT_FADEIN = config.fade.fadein ?? ms("2s");

// Default values
export const DEFAULT_VOLUME = config.volume.default ?? 0.2;
export const DEFAULT_BASS = config.equalizer.bass_default ?? 0;
export const DEFAULT_TREBLE = config.equalizer.treble_default ?? 0;
export const DEFAULT_COMPRESSOR = config.compressor.default ?? false;
export const DEFAULT_NORMALIZE = config.normalize.default ?? false;
export const DEFAULT_START_TIME_PLAY = config.time.play.default ?? 1000;
