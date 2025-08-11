import * as RStream from "readable-stream";
import type { AudioProcessingOptions } from "../../types/audio.js";
import {
	VOLUME_MIN,
	VOLUME_MAX,
	BASS_MIN,
	BASS_MAX,
	TREBLE_MIN,
	TREBLE_MAX,
} from "../../utils/constants.js";
import { bot } from "../../bot.js";

/**
 * Преобразует пользовательское значение в диапазоне [-1, 1] в линейный gain,
 * используя промежуточное представление в децибелах с мягкой нелинейной кривой.
 */
function userToGainLinear(userVal: number, maxDb = 12): number {
	const v = Math.max(-1, Math.min(1, userVal)); // clamp
	const db = Math.sign(v) * Math.pow(Math.abs(v), 0.5) * maxDb; // мягкая кривая
	return Math.pow(10, db / 20); // dB -> линейный коэффициент
}

/**
 * Ожидает bass/treble в нормализованном диапазоне [-1,1].
 * Преобразует в dB с мягкой кривой.
 */
function userToGainDb(userVal: number, maxDb = 15): number {
	const v = Math.max(-1, Math.min(1, userVal));
	return Math.sign(v) * Math.pow(Math.abs(v), 0.5) * maxDb;
}

/**
 * Простой компрессор в плавающей точке.
 * threshold в нормализованной шкале (0..1), ratio >=1
 */
function compressSample(value: number, threshold = 0.8, ratio = 4): number {
	const abs = Math.abs(value);
	if (abs <= threshold) return value;
	const excess = abs - threshold;
	const compressed = threshold + excess / ratio;
	return Math.sign(value) * compressed;
}

export class AudioProcessor extends RStream.Transform {
	private volume: number;
	private bass: number; // предполагается в нормализованном диапазоне [-1,1]
	private treble: number; // аналогично
	private compressor: boolean;
	private isFading = false;
	private lastVolume: number;
	private isDestroyed = false;

	// Fade (time-based)
	private fadeStartTime: number | null = null;
	private fadeDuration = 0;
	private fadeFrom = 0;
	private fadeTo = 0;

	// Filter states for dynamic EQ
	private trebleHighPassStateL = 0;
	private trebleHighPassStateR = 0;

	// Enhanced bass filter states
	private bassFilter60StateL = 0;
	private bassFilter60StateR = 0;
	private bassEq120StateL = 0;
	private bassEq120StateR = 0;
	private bassLowpassStateL = 0;
	private bassLowpassStateR = 0;

	constructor(options: AudioProcessingOptions) {
		super();
		this.volume = this.clampVolume(options.volume);
		this.lastVolume = this.volume;
		// Приводим bass/treble к нормализованной шкале [-1,1] при необходимости
		this.bass = this.clampBass(options.bass);
		this.treble = this.clampTreble(options.treble);
		this.compressor = !!options.compressor;

		// Initialize filter states
		this.trebleHighPassStateL = 0;
		this.trebleHighPassStateR = 0;

		// Initialize enhanced bass filter states
		this.bassFilter60StateL = 0;
		this.bassFilter60StateR = 0;
		this.bassEq120StateL = 0;
		this.bassEq120StateR = 0;
		this.bassLowpassStateL = 0;
		this.bassLowpassStateR = 0;

		// Обработчики состояния потока
		this.on("error", (error) => {
			bot?.logger.debug(
				"[AudioProcessor] Stream error:",
				error?.message ?? error,
			);
			if (!this.isDestroyed) {
				this.safeDestroy();
			}
		});

		this.on("close", () => {
			bot?.logger.debug("[AudioProcessor] Stream closed");
			this.isDestroyed = true;
		});

		this.on("finish", () => {
			bot?.logger.debug("[AudioProcessor] Stream finished");
		});
	}

	private clampVolume(volume: number): number {
		return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, volume));
	}

	private clampBass(bass: number): number {
		// ожидаем, что исходный bass в каком-то диапазоне, нормализуем в [-1,1]
		// если BASS_MIN..BASS_MAX (-1..1 или -100..100), адаптировать под свой случай
		const normalized =
			BASS_MAX !== BASS_MIN
				? ((bass - BASS_MIN) / (BASS_MAX - BASS_MIN)) * 2 - 1
				: bass;
		return Math.max(-1, Math.min(1, normalized));
	}

	private clampTreble(treble: number): number {
		const normalized =
			TREBLE_MAX !== TREBLE_MIN
				? ((treble - TREBLE_MIN) / (TREBLE_MAX - TREBLE_MIN)) * 2 - 1
				: treble;
		return Math.max(-1, Math.min(1, normalized));
	}

	/**
	 * Мгновенная установка громкости
	 */
	setVolume(volume: number): void {
		if (this.isDestroyed) return;
		this.lastVolume = this.volume;
		this.volume = this.clampVolume(volume);
	}

	/**
	 * Плавное изменение громкости
	 */
	startFade(targetVolume: number, duration: number): void {
		if (this.isDestroyed) return;
		this.isFading = true;
		this.fadeFrom = this.volume;
		this.fadeTo = this.clampVolume(targetVolume);
		this.fadeStartTime = Date.now();
		this.fadeDuration = duration;
	}

	setEqualizer(bass: number, treble: number, compressor: boolean): void {
		if (this.isDestroyed) return;
		this.bass = this.clampBass(bass);
		this.treble = this.clampTreble(treble);
		this.compressor = compressor;
	}

	setCompressor(enabled: boolean): void {
		if (this.isDestroyed) return;
		this.compressor = enabled;
	}

	private updateFadeVolume(): void {
		if (!this.isFading || this.fadeStartTime === null) return;

		const now = Date.now();
		const elapsed = now - this.fadeStartTime;

		if (elapsed >= this.fadeDuration) {
			this.volume = this.fadeTo;
			this.isFading = false;
			this.fadeStartTime = null;
		} else {
			const progress = elapsed / this.fadeDuration;
			this.volume = this.fadeFrom + (this.fadeTo - this.fadeFrom) * progress;
		}
	}

	private processAudioSample(
		left: number,
		right: number,
		currentVolume: number,
	): [number, number] {
		// Переводим в float -1..1 нормализованно относительно 32768
		let l = left / 32768;
		let r = right / 32768;

		// Применяем громкость
		l *= currentVolume;
		r *= currentVolume;

		// --- Dynamic Bass/Treble Processing with simple IIR filters ---
		// These are simplified single-pole filters. For more precise EQ, biquad filters are recommended.
		const sampleRate = 48000; // Assuming 48kHz sample rate
		const trebleCutoffFreq = 4000; // Hz for treble effect

		// Enhanced Bass Processing (replacing the existing bass section)
		if (Math.abs(this.bass) > 0.001) {
			// Получаем усиление от пользователя, максимум 18 дБ
			const bassGainDb = userToGainDb(this.bass, 18);

			// Расчёт частоты среза lowpass: при положительном усилении срез ниже, при отрицательном — выше
			let lowpassFreq: number;
			if (bassGainDb >= 0) {
				// 4000 ... 3890 Гц (чем выше усиление, тем ниже частота среза)
				lowpassFreq = 4000 - (bassGainDb / 18) * 110;
			} else {
				// 4000 ... 5000 Гц (чем сильнее отрицательное усиление, тем выше частота среза)
				lowpassFreq = 4000 + (Math.abs(bassGainDb) / 18) * 1000;
			}

			// Расчёт Q-factor для lowpass: при положительном усилении Q выше (более резкий срез), при отрицательном — ниже
			let lowpassQ: number;
			if (bassGainDb >= 0) {
				// 0.7 ... 2.5 (чем выше усиление, тем выше Q-factor для более резкого среза)
				lowpassQ = 0.7 + (bassGainDb / 18) * 1.8;
			} else {
				// 0.7 ... 0.3 (чем сильнее отрицательное усиление, тем ниже Q-factor для более мягкого среза)
				lowpassQ = 0.7 - (Math.abs(bassGainDb) / 18) * 0.4;
			}

			// Bass filter at 60Hz (equivalent to bass=g=X:f=60:w=1.0)
			const bassGain60 = userToGainLinear(this.bass * 0.7, 18); // Apply 0.7 factor like in FFmpeg
			const alpha60 = (2 * Math.PI * 60) / sampleRate;

			this.bassFilter60StateL =
				this.bassFilter60StateL + alpha60 * (l - this.bassFilter60StateL);
			this.bassFilter60StateR =
				this.bassFilter60StateR + alpha60 * (r - this.bassFilter60StateR);

			l = l + this.bassFilter60StateL * (bassGain60 - 1);
			r = r + this.bassFilter60StateR * (bassGain60 - 1);

			// Equalizer at 120Hz (equivalent to equalizer=f=120:width_type=o:width=2.5:g=X)
			const eqGain120 = userToGainLinear(this.bass * 0.5, 18); // Apply 0.5 factor like in FFmpeg
			const alpha120 = (2 * Math.PI * 120) / sampleRate;

			this.bassEq120StateL =
				this.bassEq120StateL + alpha120 * (l - this.bassEq120StateL);
			this.bassEq120StateR =
				this.bassEq120StateR + alpha120 * (r - this.bassEq120StateR);

			l = l + this.bassEq120StateL * (eqGain120 - 1);
			r = r + this.bassEq120StateR * (eqGain120 - 1);

			// Apply biquad filter (we need to store more state for this)
			// For simplicity, using a modified single-pole approach with Q-factor influence
			const effectiveAlpha = (2 * Math.PI * lowpassFreq) / sampleRate;
			const qInfluence = Math.min(lowpassQ * 0.5, 0.95); // Limit Q influence

			this.bassLowpassStateL =
				this.bassLowpassStateL * (1 - effectiveAlpha * qInfluence) +
				l * effectiveAlpha * qInfluence;
			this.bassLowpassStateR =
				this.bassLowpassStateR * (1 - effectiveAlpha * qInfluence) +
				r * effectiveAlpha * qInfluence;

			// Apply lowpass with Q-factor influence (blend original and filtered)
			const blendFactor = 0.3 + (lowpassQ - 0.7) * 0.2; // Adjust blend based on Q
			l = this.bassLowpassStateL + (l - this.bassLowpassStateL) * blendFactor;
			r = this.bassLowpassStateR + (r - this.bassLowpassStateR) * blendFactor;

			// Simple limiter if bass gain is high (equivalent to limiterNeeded logic)
			if (Math.abs(bassGainDb) > 6) {
				const limiterThreshold = 0.85;
				const limiterRatio = 8;

				if (Math.abs(l) > limiterThreshold) {
					const excess = Math.abs(l) - limiterThreshold;
					const compressed = limiterThreshold + excess / limiterRatio;
					l = Math.sign(l) * compressed;
				}

				if (Math.abs(r) > limiterThreshold) {
					const excess = Math.abs(r) - limiterThreshold;
					const compressed = limiterThreshold + excess / limiterRatio;
					r = Math.sign(r) * compressed;
				}
			}
		}

		// Treble (High-shelf simulation)
		if (Math.abs(this.treble) > 0.001) {
			const trebleGain = userToGainLinear(this.treble, 12); // Max 12dB for internal processing
			// Alpha for a single-pole low-pass filter used to derive high-pass
			const alphaTreble = (2 * Math.PI * trebleCutoffFreq) / sampleRate;

			// Apply simple low-pass filter to get the low-frequency component for high-pass calculation
			const lpStateL =
				this.trebleHighPassStateL +
				alphaTreble * (l - this.trebleHighPassStateL);
			const lpStateR =
				this.trebleHighPassStateR +
				alphaTreble * (r - this.trebleHighPassStateR);

			// High-pass component is original signal minus low-pass component
			const highPassL = l - lpStateL;
			const highPassR = r - lpStateR;

			this.trebleHighPassStateL = lpStateL; // Update state for next iteration
			this.trebleHighPassStateR = lpStateR;

			// Boost/cut the high-frequency component
			l = l + highPassL * (trebleGain - 1);
			r = r + highPassR * (trebleGain - 1);
		}
		// --- End Dynamic Bass/Treble Processing ---

		// Компрессия
		if (this.compressor) {
			l = compressSample(l);
			r = compressSample(r);
		}

		// Ограничение (в float) и перевод назад в int16
		l = Math.max(-1, Math.min(1, l));
		r = Math.max(-1, Math.min(1, r));

		const outL = Math.round(l * 32767);
		const outR = Math.round(r * 32767);

		return [outL, outR];
	}

	_transform(
		chunk: Buffer,
		_encoding: string,
		callback: (error?: Error | null, data?: any) => void,
	): void {
		if (this.isDestroyed || this.destroyed) {
			callback();
			return;
		}

		try {
			this.updateFadeVolume();

			const samples = new Int16Array(
				chunk.buffer,
				chunk.byteOffset,
				chunk.length / 2,
			);

			const frameCount = samples.length / 2; // количество стерео-кадров
			const volumeDelta = this.volume - this.lastVolume;
			const volumeStep = frameCount > 0 ? volumeDelta / frameCount : 0;

			for (let frame = 0; frame < frameCount; frame++) {
				const idx = frame * 2;
				const left = samples[idx];
				const right = samples[idx + 1] ?? left;
				const currentVolume = this.lastVolume + volumeStep * frame; // Interpolate volume for smooth fades

				const [processedLeft, processedRight] = this.processAudioSample(
					left,
					right,
					currentVolume,
				);

				samples[idx] = processedLeft;
				samples[idx + 1] = processedRight;
			}

			this.lastVolume = this.volume;
			callback(null, chunk);
		} catch (error) {
			bot?.logger.error("[AudioProcessor] Error in transform:", error);
			this.safeDestroy();
			callback();
		}
	}

	private safeDestroy(): void {
		if (this.isDestroyed) return;

		this.isDestroyed = true;
		try {
			this.removeAllListeners();
			if (!this.destroyed) {
				this.destroy();
			}
		} catch (error) {
			bot?.logger.debug(
				"[AudioProcessor] Error during safe destroy:",
				(error as Error).message,
			);
		}
	}

	override destroy(error?: Error): this {
		if (this.isDestroyed) return this;
		this.isDestroyed = true;
		this.removeAllListeners();
		return super.destroy(error);
	}
}
