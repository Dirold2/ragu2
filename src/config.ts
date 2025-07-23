/**
 * Volume settings
 */
export const VOLUME = {
	MIN: 0,
	MAX: 0.5,
	DEFAULT: 0.2,
	// For PlayerService (percentage)
	MIN_PERCENT: 0,
	MAX_PERCENT: 50,
	DEFAULT_PERCENT: 2,
	// Volume presets
	PRESETS: {
		QUIET: 0.1,
		NORMAL: 0.2,
		LOUD: 0.3,
		MAX: 0.5,
	},
} as const;

/**
 * Equalizer settings
 */
export const EQUALIZER = {
	BASS_MIN: -20,
	BASS_MAX: 20,
	TREBLE_MIN: -20,
	TREBLE_MAX: 20,
	BASS_DEFAULT: 0,
	TREBLE_DEFAULT: 0,
} as const;

/**
 * Compressor settings
 */
export const COMPRESSOR = {
	DEFAULT: false,
} as const;

/**
 * Normalize settings
 */
export const NORMALIZE = {
	DEFAULT: false,
} as const;

/**
 * Low pass filter settings
 */
export const LOWPASS = {
	MIN_FREQ: 0,
	MAX_FREQ: 20000,
	MIN_Q: 0.1,
	MAX_Q: 10,
	DEFAULT_Q: 0.8,
	DEFAULT_FREQ: 100,
	// Presets for different use cases
	PRESETS: {
		SUBWOOFER: {
			freq: 80,
			q: 0.7,
		},
		SPEAKERS: {
			freq: 525.45,
			q: 4,
		},
		HEADPHONES: {
			freq: 1000,
			q: 2,
		},
		VOICE: {
			freq: 3000,
			q: 1,
		},
	},
} as const;
