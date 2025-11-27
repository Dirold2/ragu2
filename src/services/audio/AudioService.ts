import { EventEmitter } from "eventemitter3";
import { Transform } from "node:stream";
import { StreamType } from "@discordjs/voice";
import { FluentStream } from "fluent-streamer";
import type { AudioProcessingOptions } from "../../types/audio.js";
import {
	DEFAULT_VOLUME,
	DEFAULT_BASS,
	DEFAULT_TREBLE,
	DEFAULT_COMPRESSOR,
	DEFAULT_NORMALIZE,
} from "../../utils/constants.js";

export class AudioService extends EventEmitter {
	private ffmpeg!: FluentStream;
	private currentOptions: Required<AudioProcessingOptions>;
	private _fadeInterval?: NodeJS.Timeout;
	private pipelineReady: boolean = false;
	private currentProcess?: { stop: () => void; done: Promise<void> };
	private _isCreating: boolean = false;
	private _isStopping: boolean = false;

	constructor(options: Partial<AudioProcessingOptions> = {}) {
		super();
		this.currentOptions = {
			volume: DEFAULT_VOLUME,
			bass: DEFAULT_BASS,
			treble: DEFAULT_TREBLE,
			compressor: DEFAULT_COMPRESSOR,
			normalize: DEFAULT_NORMALIZE,
			headers: {},
			fade: { fadein: 3000, fadeout: 3000 },
			...options,
		};

		this.ffmpeg = new FluentStream({
			useAudioProcessor: true,
			disableThrottling: true,
		});

		this.ffmpeg.volume = this.currentOptions.volume;
		this.ffmpeg.bass = this.currentOptions.bass;
		this.ffmpeg.treble = this.currentOptions.treble;
		this.ffmpeg.compressor = this.currentOptions.compressor;
	}

	/**
	 * Create PCM-RAW stream for Discord with minimal latency
	 * Создаёт поток PCM-RAW для проигрывания в Discord с минимальной задержкой
	 */
	async createAudioStreamForDiscord(
		url: string,
		options?: Partial<AudioProcessingOptions>,
	): Promise<{ stream: Transform; type: StreamType }> {
		if (options) Object.assign(this.currentOptions, options);

		while (this._isCreating || this._isStopping) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		this._isCreating = true;
		try {
			await this.destroy();
			await new Promise((resolve) => setTimeout(resolve, 150));

			this.pipelineReady = false;
			this.ffmpeg.clear();

			this.ffmpeg.volume = this.currentOptions.volume;
			this.ffmpeg.bass = this.currentOptions.bass;
			this.ffmpeg.treble = this.currentOptions.treble;
			this.ffmpeg.compressor = this.currentOptions.compressor;

			if (
				this.currentOptions.headers &&
				Object.keys(this.currentOptions.headers).length > 0
			) {
				this.ffmpeg.setHeaders(this.currentOptions.headers);
			}

			this.ffmpeg
				.input(url)
				.inputOptions(
					"-re",
					"-fflags",
					"nobuffer",
					"-flags",
					"low_delay",
					"-probesize",
					"32",
					"-analyzeduration",
					"0",
				)
				.audioCodec("pcm_s16le")
				.outputOptions(
					"-f",
					"s16le",
					"-ar",
					"48000",
					"-ac",
					"2",
					"-af",
					"volume=0.1",
				)
				.output("pipe:1");

			const { output, done, stop } = await this.ffmpeg.run();

			this.currentProcess = { stop, done };

			done
				.then(() => {
					this.emit("debug", `[AudioService] Stream finished for ${url}`);
				})
				.catch((err: Error) => {
					if (!this._isStopping) {
						this.emit("error", err);
					}
				})
				.finally(() => {
					this.pipelineReady = false;
				});

			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => resolve(), 1000);
				output.once("data", () => {
					clearTimeout(timeout);
					resolve();
				});
			});

			this.pipelineReady = true;
			this.emit(
				"debug",
				`[AudioService] Stream created for ${url} with effects: vol=${this.currentOptions.volume}, bass=${this.currentOptions.bass}`,
			);

			return { stream: output, type: StreamType.Raw };
		} finally {
			this._isCreating = false;
		}
	}

	/**
	 * Stop the currently running ffmpeg process
	 * Остановить текущий запущенный процесс ffmpeg
	 */
	async stop(): Promise<void> {
		if (this._isStopping) {
			return;
		}

		while (this._isCreating) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		this._isStopping = true;
		try {
			if (this.currentProcess) {
				this.currentProcess.stop();

				await Promise.race([
					this.currentProcess.done,
					new Promise((resolve) => setTimeout(resolve, 2000)),
				]).catch(() => {
					// Игнорируем ошибки при остановке
				});

				this.currentProcess = undefined;
			}

			await this.destroy();
			await new Promise((resolve) => setTimeout(resolve, 100));
		} finally {
			this._isStopping = false;
		}
	}

	async setVolume(
		target: number,
		duration: number = 1000,
		set: boolean = true,
	) {
		target = Math.max(0, Math.min(1, target));
		if (set) {
			this.currentOptions.volume = target;
		}

		this.ffmpeg.fadeIn(target, duration);
		this.emit("volumeChanged", target * 100);
	}

	setVolumeFast(volume: number, set: boolean = true): void {
		if (set) {
			this.currentOptions.volume = volume;
		}

		const changed = this.ffmpeg.changeVolume(volume);
		if (!changed) {
			this.emit(
				"debug",
				`[AudioService] Volume will be applied on next track: ${volume}`,
			);
		}

		this.emit("volumeChanged", volume * 100);
	}

	setBass(bass: number): void {
		this.currentOptions.bass = bass;
		const changed = this.ffmpeg.changeBass(bass);
		if (!changed) {
			this.emit(
				"debug",
				`[AudioService] Bass will be applied on next track: ${bass}`,
			);
		}

		this.emit("equalizerChanged", this.currentOptions);
	}

	setTreble(treble: number): void {
		this.currentOptions.treble = treble;
		const changed = this.ffmpeg.changeTreble(treble);
		if (!changed) {
			this.emit(
				"debug",
				`[AudioService] Treble will be applied on next track: ${treble}`,
			);
		}

		this.emit("equalizerChanged", this.currentOptions);
	}

	setCompressor(enabled: boolean): void {
		this.currentOptions.compressor = enabled;
		const changed = this.ffmpeg.changeCompressor(enabled);
		if (!changed) {
			this.emit(
				"debug",
				`[AudioService] Compressor will be applied on next track: ${enabled}`,
			);
		}

		this.emit("compressorChanged", enabled);
	}

	setNormalize(enabled: boolean): void {
		this.currentOptions.normalize = enabled;
		this.emit("normalizeChanged", enabled);
	}

	async fadeIn(duration = 2000): Promise<void> {
		if (!this.pipelineReady) {
			await new Promise((resolve) => setTimeout(resolve, 50));
			if (!this.pipelineReady) return;
		}

		setTimeout(() => {
			this.emit("volumeChanged", this.currentOptions.volume * 100);
		}, duration);
	}

	// ==================== CLEANUP ====================

	async destroy(): Promise<void> {
		try {
			if (this._fadeInterval) {
				clearInterval(this._fadeInterval);
				this._fadeInterval = undefined;
			}

			this.pipelineReady = false;

			if (this.currentProcess) {
				this.currentProcess.stop();
				await this.currentProcess.done.catch(() => {});
				this.currentProcess = undefined;
			}

			if (this.ffmpeg) {
				this.ffmpeg.removeAllListeners();
				if (this.ffmpeg.isDirtyState()) {
					this.ffmpeg.clear();
				}
			}

			this.emit("debug", "[AudioService] Stream destroyed");
		} catch (e) {
			this.emit(
				"debug",
				`[AudioService] Destroy failed: ${(e as Error).message}`,
			);
		}
	}
}
