import config from "../../config.json" with { type: "json" };

export const DEFAULT_FADEOUT = config.audio.fade.outBeforeEnd ?? 3_000;
export const DEFAULT_FADEIN = config.audio.fade.in ?? 2_000;

export const DEFAULT_VOLUME = config.audio.volume.default ?? 0.2;
export const DEFAULT_BASS = config.audio.effects.bass.default ?? 0;
export const DEFAULT_TREBLE = config.audio.effects.treble.default ?? 0;
export const DEFAULT_COMPRESSOR = config.audio.effects.compressor ?? false;
export const DEFAULT_NORMALIZE = config.audio.effects.normalize ?? false;
