import { Readable, Transform } from "stream";
import ffmpeg from "fluent-ffmpeg";
import { request } from "undici";
import { EventEmitter } from "events";
import { COMPRESSOR, EQUALIZER, NORMALIZE, VOLUME } from "../../config.js";

interface AudioProcessingOptions {
	volume: number;
	bass: number;
	treble: number;
	compressor: boolean;
	normalize: boolean;
	lowPassFrequency?: number;
	lowPassQ?: number;
}

// Constants for limits
const VOLUME_MIN = VOLUME.MIN ?? 0;
const VOLUME_MAX = VOLUME.MAX ?? 1;
const BASS_MIN = EQUALIZER.BASS_MIN ?? -20;
const BASS_MAX = EQUALIZER.BASS_MAX ?? 20;
const TREBLE_MIN = EQUALIZER.TREBLE_MIN ?? -20;
const TREBLE_MAX = EQUALIZER.TREBLE_MAX ?? 20;

/**
 * Transform stream for processing PCM audio data with real-time effects and smooth volume fade
 */
class AudioProcessor extends Transform {
	private volume: number;
	private bass: number;
	private treble: number;
	private compressor: boolean;
	private isFading: boolean = false;
	private lastVolume: number;
	private lastLogTime: number = 0;

	// Fade (time-based)
	private fadeStartTime: number | null = null;
	private fadeDuration: number = 0;
	private fadeFrom: number = 0;
	private fadeTo: number = 0;

	constructor(options: AudioProcessingOptions) {
		super();
		this.volume = options.volume;
		this.lastVolume = options.volume;
		this.bass = options.bass;
		this.treble = options.treble;
		this.compressor = options.compressor;
	}

	/**
	 * Set volume instantly
	 */
	setVolume(volume: number): void {
		this.lastVolume = this.volume;
		this.volume = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, volume));
		this.logVolume();
	}

	/**
	 * Start smooth fade to target volume over duration (ms)
	 */
	startFade(targetVolume: number, duration: number): void {
		this.isFading = true;
		this.fadeFrom = this.volume;
		this.fadeTo = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, targetVolume));
		this.fadeStartTime = Date.now();
		this.fadeDuration = duration;
	}

	setEqualizer(bass: number, treble: number): void {
		this.bass = Math.max(BASS_MIN, Math.min(BASS_MAX, bass));
		this.treble = Math.max(TREBLE_MIN, Math.min(TREBLE_MAX, treble));
	}

	setCompressor(enabled: boolean): void {
		this.compressor = enabled;
	}

	private logVolume(): void {
		const now = Date.now();
		if (now - this.lastLogTime >= 1000) {
			console.log(`[Volume] ${Math.round(this.volume * 100)}%`);
			this.lastLogTime = now;
		}
	}

	_transform(chunk: Buffer, _encoding: string, callback: Function): void {
		try {
			// Time-based fade
			if (this.isFading && this.fadeStartTime !== null) {
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
				this.logVolume();
			}

			const samples = new Int16Array(
				chunk.buffer,
				chunk.byteOffset,
				chunk.length / 2,
			);

			// Smooth volume change per sample
			const volumeDelta = this.volume - this.lastVolume;
			const volumeStep = volumeDelta / samples.length;

			for (let i = 0; i < samples.length; i += 2) {
				let left = samples[i];
				let right = samples[i + 1] ?? left;

				const currentVolume = this.lastVolume + (volumeStep * i);
				left = Math.round(left * currentVolume);
				right = Math.round(right * currentVolume);

				// Equalizer
				if (this.bass !== 0) {
					const bassMultiplier = 1 + this.bass / 100;
					left = Math.round(left * bassMultiplier);
					right = Math.round(right * bassMultiplier);
				}
				if (this.treble !== 0) {
					const trebleMultiplier = 1 + this.treble / 100;
					left = Math.round(left * trebleMultiplier);
					right = Math.round(right * trebleMultiplier);
				}

				// Compressor
				if (this.compressor) {
					const threshold = 0.8;
					const ratio = 4;
					const leftNorm = left / 32768;
					const rightNorm = right / 32768;
					if (Math.abs(leftNorm) > threshold) {
						const excess = Math.abs(leftNorm) - threshold;
						const compressed = threshold + excess / ratio;
						left = Math.round(compressed * 32768 * Math.sign(leftNorm));
					}
					if (Math.abs(rightNorm) > threshold) {
						const excess = Math.abs(rightNorm) - threshold;
						const compressed = threshold + excess / ratio;
						right = Math.round(compressed * 32768 * Math.sign(rightNorm));
					}
				}

				// Final overflow check
				samples[i] = Math.max(-32768, Math.min(32767, left));
				samples[i + 1] = Math.max(-32768, Math.min(32767, right));
			}

			this.lastVolume = this.volume;
			callback(null, chunk);
		} catch (error) {
			console.error("[AudioProcessor] Error in transform:", error);
			callback(error);
		}
	}
}

/**
 * Определяет формат аудиофайла по mime-type
 */
function getInputFormatFromMimeType(mimeType: string | undefined): string | undefined {
	if (!mimeType) return undefined;
	if (mimeType.includes('mpeg')) return 'mp3';
	if (mimeType.includes('flac')) return 'flac';
	if (mimeType.includes('ogg')) return 'ogg';
	if (mimeType.includes('wav')) return 'wav';
	if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
	if (mimeType.includes('opus')) return 'opus';
	return undefined;
}

/**
 * AudioService: main audio processing and effects manager
 */
export class AudioService extends EventEmitter {
	private processor: AudioProcessor | null = null;
	private currentOptions: AudioProcessingOptions;

	constructor(
		options: AudioProcessingOptions = {
			volume: VOLUME.DEFAULT ?? 0.2,
			bass: EQUALIZER.BASS_DEFAULT ?? 0,
			treble: EQUALIZER.TREBLE_DEFAULT ?? 0,
			compressor: COMPRESSOR.DEFAULT ?? false,
			normalize: NORMALIZE.DEFAULT ?? false,
		},
	) {
		super();
		this.currentOptions = options;
	}

	async setVolume(volume: number, duration = 2000): Promise<void> {
		const clampedVolume = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, volume));
		this.currentOptions.volume = clampedVolume;
		if (this.processor) {
			this.processor.startFade(clampedVolume, duration);
			this.emit("volumeChanged", clampedVolume * 100);
		}
	}

	setVolumeFast(volume: number) {
		const clampedVolume = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, volume));
		this.currentOptions.volume = clampedVolume;
		if (this.processor) {
			this.processor.setVolume(clampedVolume);
			this.emit("volumeChanged", clampedVolume * 100);
		}
	}

	setBass(bass: number) {
		this.currentOptions.bass = Math.max(BASS_MIN, Math.min(BASS_MAX, bass));
		if (this.processor) {
			this.processor.setEqualizer(this.currentOptions.bass, this.currentOptions.treble);
			this.emit("equalizerChanged", { bass: this.currentOptions.bass, treble: this.currentOptions.treble });
		}
	}

	setTreble(treble: number) {
		this.currentOptions.treble = Math.max(TREBLE_MIN, Math.min(TREBLE_MAX, treble));
		if (this.processor) {
			this.processor.setEqualizer(this.currentOptions.bass, this.currentOptions.treble);
			this.emit("equalizerChanged", { bass: this.currentOptions.bass, treble: this.currentOptions.treble });
		}
	}

	setCompressor(enabled: boolean) {
		this.currentOptions.compressor = enabled;
		if (this.processor) {
			this.processor.setCompressor(enabled);
			this.emit("compressorChanged", enabled);
		}
	}

	setNormalize(enabled: boolean) {
		this.currentOptions.normalize = enabled;
	}

	setLowPassFrequency(frequency?: number) {
		this.currentOptions.lowPassFrequency = frequency;
	}

	async getInputFormatFromHeaders(url: string): Promise<string | undefined> {
		try {
			const { headers } = await request(url, { method: 'HEAD' });
			const mimeType = headers['content-type'] as string | undefined;
			return getInputFormatFromMimeType(mimeType);
		} catch {
			return undefined;
		}
	}

	async createAudioStreamFromUrl(url: string): Promise<Readable> {
		const inputFormat = await this.getInputFormatFromHeaders(url);
		const { body } = await request(url, { method: 'GET' });
		return this.createProcessedStream(body as Readable, inputFormat);
	}

	createProcessedStream(inputStream: Readable, inputFormat?: string): Readable {
		const filters = this.buildAudioFilters();

		console.log(inputFormat);

		const ffmpegCommand = ffmpeg()
			.input(inputStream)
			.inputFormat(inputFormat ?? "mp3")
			.audioCodec("pcm_s16le")
			.format("s16le")
			.audioFrequency(48000)
			.audioChannels(2)
			.audioFilters(filters)
			.on("start", (cmd: string) => this.emit("debug", `FFmpeg started: ${cmd}`))
			.on("error", (err: Error) => this.emit("error", err))
			.on("stderr", (line: string) => this.emit("debug", `FFmpeg stderr: ${line}`));

		this.processor = new AudioProcessor(this.currentOptions);
		ffmpegCommand.pipe(this.processor);
		this.emit("streamCreated", this.processor);

		return this.processor;
	}

	createFadeStream(
		inputStream: Readable,
		type: "in" | "out",
		durationMs: number,
	): Readable {
		const durationSec = durationMs / 1000;
		const fadeFilter = `afade=t=${type}:st=0:d=${durationSec}`;

		const ffmpegCommand = ffmpeg()
			.input(inputStream)
			.inputFormat("s16le")
			.audioCodec("pcm_s16le")
			.format("s16le")
			.audioFrequency(48000)
			.audioChannels(2)
			.audioFilters([fadeFilter])
			.on("start", (cmd) => this.emit("debug", `Fade ${type} started: ${cmd}`))
			.on("error", (err) => this.emit("error", err));

		return ffmpegCommand.pipe() as unknown as Readable;
	}

	createCrossfadeStream(
		prevStream: Readable,
		nextStream: Readable,
		durationMs: number,
	): Readable {
		const durationSec = durationMs / 1000;

		const ffmpegCommand = ffmpeg()
			.input(prevStream)
			.inputFormat("s16le")
			.input(nextStream)
			.inputFormat("s16le")
			.complexFilter([`acrossfade=d=${durationSec}:c1=tri:c2=tri`])
			.audioCodec("pcm_s16le")
			.format("s16le")
			.audioFrequency(48000)
			.audioChannels(2)
			.on("start", (cmd) => this.emit("debug", `Crossfade started: ${cmd}`))
			.on("error", (err) => this.emit("error", err));

		return ffmpegCommand.pipe() as unknown as Readable;
	}

	private buildAudioFilters(): string[] {
		const { volume, bass, treble, compressor, normalize, lowPassFrequency } =
			this.currentOptions;
		const filters: string[] = [];

		filters.push(`volume=${volume}`);
		if (bass !== 0 || treble !== 0) {
			filters.push(`equalizer=f=100:t=q:w=1:g=${bass}`);
			filters.push(`equalizer=f=10000:t=q:w=1:g=${treble}`);
		}
		if (compressor) filters.push("acompressor");
		if (normalize) filters.push("dynaudnorm");
		if (lowPassFrequency) filters.push(`lowpass=f=${lowPassFrequency}`);

		return filters;
	}

	destroy(): void {
		this.processor = null;
		this.removeAllListeners();
	}
}
