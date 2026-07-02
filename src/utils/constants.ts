import config from "../../config.json" with { type: "json" };
import ms from "ms";

export const VOLUME_MIN = config.audio.volume.range.min ?? 0;
export const VOLUME_MAX = config.audio.volume.range.max ?? 1;
export const BASS_MIN = config.audio.effects.bass.range.min ?? -20;
export const BASS_MAX = config.audio.effects.bass.range.max ?? 20;
export const TREBLE_MIN = config.audio.effects.treble.range.min ?? -20;
export const TREBLE_MAX = config.audio.effects.treble.range.max ?? 20;

export const DEFAULT_FADEOUT = config.audio.fade.outBeforeEnd ?? ms("3s");
export const DEFAULT_FADEIN = config.audio.fade.in ?? ms("2s");

export const DEFAULT_VOLUME = config.audio.volume.default ?? 0.2;
export const DEFAULT_BASS = config.audio.effects.bass.default ?? 0;
export const DEFAULT_TREBLE = config.audio.effects.treble.default ?? 0;
export const DEFAULT_COMPRESSOR = config.audio.effects.compressor ?? false;
export const DEFAULT_NORMALIZE = config.audio.effects.normalize ?? false;
export const DEFAULT_START_TIME_PLAY = config.playback.startPosition ?? 1000;
