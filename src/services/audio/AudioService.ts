import type { Readable } from "readable-stream";
import type { SimpleFFmpeg } from "./SimpleFfmpegWrapper.js";
import { request } from "undici";
import { EventEmitter } from "eventemitter3";
import { StreamType } from "@discordjs/voice";
import { AudioProcessor } from "./AudioProcessor.js";
import { getInputFormatFromMimeType } from "../../utils/audioFormat.js";
import type { AudioProcessingOptions } from "../../types/audio.js";
import {
	DEFAULT_VOLUME,
	DEFAULT_BASS,
	DEFAULT_TREBLE,
	DEFAULT_COMPRESSOR,
	DEFAULT_NORMALIZE,
} from "../../utils/constants.js";
import { FFmpegManager } from "./FfmpegManager.js";
import {
	safeRequestStream,
	safeRequestStreamWithRetry,
} from "../../utils/safeRequestStream.js";
import type { IncomingHttpHeaders } from "http";

/**
 * AudioService: main audio processing and effects manager
 */
export class AudioService extends EventEmitter {
	private processor: AudioProcessor | null = null;
	private currentInputStream: Readable | null = null;
	private ffmpegManager = new FFmpegManager();
	private currentFFmpegCommand: SimpleFFmpeg | null = null;
	private currentOptions: AudioProcessingOptions;

	constructor(options: Partial<AudioProcessingOptions> = {}) {
		super();
		this.currentOptions = {
			volume: DEFAULT_VOLUME,
			bass: DEFAULT_BASS,
			treble: DEFAULT_TREBLE,
			compressor: DEFAULT_COMPRESSOR,
			normalize: DEFAULT_NORMALIZE,
			...options,
		};

		// Forward FFmpeg manager events
		this.ffmpegManager.on("error", (error) => this.emit("error", error));
		this.ffmpegManager.on("debug", (message) => this.emit("debug", message));
	}

	async setVolume(volume: number, duration = 2000, set = true): Promise<void> {
		if (set) {
			this.currentOptions.volume = volume;
		}
		if (this.processor) {
			this.processor.startFade(volume, duration);
			this.emit("volumeChanged", volume * 100);
		}
	}

	setVolumeFast(volume: number, set = false): void {
		if (set) {
			this.currentOptions.volume = volume;
		}
		if (this.processor) {
			this.processor.setVolume(volume);
			this.emit("volumeChanged", volume * 100);
		}
	}

	setBass(bass: number): void {
		this.currentOptions.bass = bass;
		this.updateEqualizer();
	}

	setTreble(treble: number): void {
		this.currentOptions.treble = treble;
		this.updateEqualizer();
	}

	private updateEqualizer(): void {
		if (this.processor) {
			this.processor.setEqualizer(
				this.currentOptions.bass,
				this.currentOptions.treble,
				this.currentOptions.compressor,
			);
			this.emit("equalizerChanged", {
				bass: this.currentOptions.bass,
				treble: this.currentOptions.treble,
				compressor: this.currentOptions.compressor,
				normalize: this.currentOptions.normalize,
			});
		}
	}

	setCompressor(enabled: boolean): void {
		this.currentOptions.compressor = enabled;
		if (this.processor) {
			this.processor.setCompressor(enabled);
			this.emit("compressorChanged", enabled);
		}
	}

	setLowPassFrequency(frequency?: number): void {
		this.currentOptions.lowPassFrequency = frequency;
		this.emit("lowPassChanged", frequency);
	}

	async fadeIn(): Promise<void> {
		if (!this.processor) return;

		// Сразу ставим громкость 0 без плавности (быстрый сброс)
		this.setVolumeFast(0, false);

		// Плавно повышаем до текущего заданного уровня за время fadein
		this.processor.startFade(
			this.currentOptions.volume,
			this.currentOptions.fade?.fadein ?? 3000,
		);

		this.emit("volumeChanged", this.currentOptions.volume * 100);
	}

	/**
	 * Следует редиректам для HEAD-запроса (до ограниченного числа) и возвращает заголовки.
	 */
	private async getHeadersFollowingRedirects(
		url: string,
		maxRedirects = 5,
	): Promise<IncomingHttpHeaders> {
		let current = url;
		for (let i = 0; i < maxRedirects; i++) {
			// Используем увеличенные таймауты для всех запросов
			const headersTimeout = 15000; // 15 секунд для всех запросов
			const bodyTimeout = 15000; // 15 секунд для всех запросов

			const res = await request(current, {
				method: "HEAD",
				headersTimeout,
				bodyTimeout,
			});
			if (
				res.statusCode >= 300 &&
				res.statusCode < 400 &&
				res.headers.location
			) {
				let loc = res.headers.location;
				if (Array.isArray(loc)) loc = loc[0];
				if (typeof loc !== "string") break;
				if (!loc.startsWith("http")) {
					loc = new URL(loc, current).toString();
				}
				current = loc;
				continue;
			}
			return res.headers;
		}
		throw new Error(`Too many redirects when fetching headers for ${url}`);
	}

	async getInputFormatFromHeaders(url: string): Promise<string | undefined> {
		try {
			const headers = await this.getHeadersFollowingRedirects(url);
			const mimeType =
				typeof headers["content-type"] === "string"
					? headers["content-type"]
					: Array.isArray(headers["content-type"])
						? headers["content-type"][0]
						: undefined;
			return getInputFormatFromMimeType(mimeType);
		} catch {
			return undefined;
		}
	}
	/**
	 * Ожидает bass/treble в нормализованном диапазоне [-1,1].
	 * Преобразует в dB с мягкой кривой.
	 * NOTE: This function is no longer used for EQ if AudioProcessor handles it.
	 */
	userToGainDb(userVal: number, maxDb = 15): number {
		const v = Math.max(-1, Math.min(1, userVal));
		return Math.sign(v) * Math.pow(Math.abs(v), 0.5) * maxDb;
	}

	async createAudioStreamFromUrl(url: string): Promise<Readable> {
		// Перед новым стримом очищаем предыдущий
		await this.destroyCurrentStreamSafe().catch(() => {});

		let inputFormat: string | undefined;
		try {
			inputFormat = await this.getInputFormatFromHeaders(url);
		} catch (e) {
			this.emit(
				"debug",
				`Failed to resolve input format: ${(e as Error).message}`,
			);
			inputFormat = undefined;
		}

		let body: Readable;
		try {
			// Используем увеличенные таймауты для всех аудио-запросов
			const requestOptions = {
				method: "GET" as const,
				headersTimeout: 30000, // 30 секунд для всех запросов
				bodyTimeout: 120000, // 2 минуты для всех запросов
			};

			body = await safeRequestStreamWithRetry(url, requestOptions);
		} catch (err) {
			const error = err as Error;

			// Специальная обработка для ошибок прерывания
			if (
				error.name === "AbortError" ||
				error.message.includes("aborted") ||
				error.message.includes("Request aborted")
			) {
				this.emit("debug", `Audio request aborted for ${url}`);
				throw new Error(`Audio request was cancelled`);
			}

			// Улучшенная обработка таймаутов и ошибок подключения
			if (
				error.message.includes("timeout") ||
				error.message.includes("Connect Timeout")
			) {
				this.emit(
					"error",
					new Error(
						`Connection timeout while fetching audio from ${url}. Please check your internet connection or try again later.`,
					),
				);
				throw new Error(`Audio connection timeout: ${error.message}`);
			}

			if (
				error.message.includes("ENOTFOUND") ||
				error.message.includes("ECONNREFUSED") ||
				error.message.includes("ECONNRESET") ||
				error.message.includes("Connection failed")
			) {
				this.emit(
					"error",
					new Error(
						`Failed to connect to audio server for ${url}. The server may be unavailable.`,
					),
				);
				throw new Error(`Audio connection failed: ${error.message}`);
			}

			this.emit(
				"error",
				new Error(`Failed to fetch audio URL: ${error.message}`),
			);
			throw err;
		}

		this.currentInputStream = body;
		this.fadeIn();
		return this.createProcessedStream(body, inputFormat);
	}

	async createProcessedStream(
		inputStream: Readable,
		inputFormat?: string,
	): Promise<Readable> {
		const filters = this.buildAudioFilters();

		const ffmpegCommand = (await this.ffmpegManager.createCommand())
			.inputs(inputStream)
			.options("-fflags", "nobuffer")
			.options("-flags", "low_delay")
			.options("-f", inputFormat ?? "mp3")
			.options("-acodec", "pcm_s16le")
			.options("-f", "s16le")
			.options("-ar", "48000")
			.options("-ac", "2")
			.options("-af", filters.join(","))
			.output("pipe:1");

		this.currentFFmpegCommand = ffmpegCommand;
		this.processor = new AudioProcessor(this.currentOptions);

		// Start the FFmpeg process and get the output stream
		const { output, done } = ffmpegCommand.run();

		// Флаг для отслеживания состояния потока
		let streamEnded = false;

		// Helper to silence known benign stream errors
		const isIgnorableStreamError = (msg: string): boolean => {
			const m = msg.toLowerCase();
			return (
				m.includes("premature close") ||
				m.includes("err_stream_premature_close") ||
				m.includes("write after end") ||
				m.includes("epipe") ||
				m.includes("other side closed") ||
				m.includes("econnreset")
			);
		};

		// Обработка ошибок входного потока
		inputStream.on("error", (error) => {
			if (streamEnded) return;

			const errorMessage = error.message;

			if (isIgnorableStreamError(errorMessage)) {
				this.emit(
					"debug",
					`[AudioService] Ignored input stream error: ${errorMessage}`,
				);
				return;
			}

			if (
				errorMessage.includes("ERR_STREAM_PREMATURE_CLOSE") ||
				errorMessage.includes("Premature close")
			) {
				this.emit(
					"error",
					new Error(
						`Audio stream closed prematurely. This may be due to network issues or the audio source being unavailable.`,
					),
				);
			} else if (errorMessage.includes("timeout")) {
				this.emit(
					"error",
					new Error(
						`Audio stream timeout. The connection to the audio source was too slow.`,
					),
				);
			} else if (errorMessage.includes("write after end")) {
				this.emit(
					"error",
					new Error(
						`Audio stream write after end error. Stream was closed unexpectedly.`,
					),
				);
			} else {
				this.emit("error", new Error(`Audio stream error: ${errorMessage}`));
			}
		});

		// Обработка завершения входного потока
		inputStream.on("end", () => {
			this.emit("debug", "[AudioService] Input stream ended");
		});

		inputStream.on("close", () => {
			this.emit("debug", "[AudioService] Input stream closed");
		});

		// Обработка ошибок выходного потока FFmpeg
		output.on("error", (error) => {
			if (streamEnded) return;

			const errorMessage = error.message;

			if (isIgnorableStreamError(errorMessage)) {
				this.emit(
					"debug",
					`[AudioService] Ignored FFmpeg output error: ${errorMessage}`,
				);
				return;
			}

			if (
				errorMessage.includes("ERR_STREAM_PREMATURE_CLOSE") ||
				errorMessage.includes("Premature close")
			) {
				this.emit(
					"error",
					new Error(
						`FFmpeg output stream closed prematurely. Audio processing may have failed.`,
					),
				);
			} else if (errorMessage.includes("write after end")) {
				this.emit(
					"error",
					new Error(`FFmpeg output stream write after end error.`),
				);
			} else {
				this.emit(
					"error",
					new Error(`FFmpeg output stream error: ${errorMessage}`),
				);
			}
		});

		// Обработка завершения выходного потока FFmpeg
		output.on("end", () => {
			this.emit("debug", "[AudioService] FFmpeg output stream ended");
		});

		output.on("close", () => {
			this.emit("debug", "[AudioService] FFmpeg output stream closed");
		});

		// Pipe ffmpeg output into processor
		output.pipe(this.processor);

		// Optional: if you want to react when ffmpeg finishes/error
		done.catch((e) => {
			if (streamEnded) return;

			const errorMessage = e.message;

			if (isIgnorableStreamError(errorMessage)) {
				this.emit(
					"debug",
					`[AudioService] Ignored FFmpeg done error: ${errorMessage}`,
				);
				return;
			}

			if (
				errorMessage.includes("ERR_STREAM_PREMATURE_CLOSE") ||
				errorMessage.includes("Premature close")
			) {
				this.emit(
					"error",
					new Error(
						`FFmpeg process closed prematurely. This may be due to invalid audio format or network issues.`,
					),
				);
			} else if (errorMessage.includes("EPIPE")) {
				this.emit(
					"error",
					new Error(
						`FFmpeg pipe error. Audio processing pipeline was interrupted.`,
					),
				);
			} else if (errorMessage.includes("write after end")) {
				this.emit(
					"error",
					new Error(
						`FFmpeg write after end error. Stream was closed unexpectedly.`,
					),
				);
			} else {
				this.emit("error", e);
			}
		});

		done.then(() => {
			streamEnded = true;
			this.emit("debug", "[AudioService] FFmpeg finished processing");
		});

		// Обработка завершения процессора
		this.processor.on("end", () => {
			streamEnded = true;
			this.emit("debug", "[AudioService] Audio processor ended");
		});

		this.processor.on("close", () => {
			streamEnded = true;
			this.emit("debug", "[AudioService] Audio processor closed");
		});

		this.processor.on("error", (error: { message: any }) => {
			if (streamEnded) return;

			const errorMessage = error.message;

			if (errorMessage.includes("write after end")) {
				this.emit("error", new Error(`Audio processor write after end error.`));
			} else {
				this.emit("error", new Error(`Audio processor error: ${errorMessage}`));
			}
		});

		this.emit("streamCreated", this.processor);
		return this.processor;
	}

	private buildAudioFilters(): string[] {
		const { volume, lowPassFrequency } = this.currentOptions;

		const filters: string[] = [];

		// Громкость (still applied here for initial overall volume adjustment by FFmpeg)
		filters.push(`volume=${volume}`);

		// Bass and Treble are now handled dynamically by AudioProcessor.
		// Removed FFmpeg bass/treble filters from here.

		// ФНЧ (Low-pass filter - if it's a separate, non-dynamic effect)
		if (lowPassFrequency) {
			filters.push(`lowpass=f=${lowPassFrequency}`);
		}

		// Auto-limiter logic removed as it was tied to FFmpeg's bass/treble processing.
		// If a general limiter is needed, it should be added based on other criteria
		// or implemented within AudioProcessor if it needs to be dynamic.

		return filters;
	}

	async createAudioStreamForDiscord(
		url: string,
	): Promise<{ stream: Readable; type: StreamType }> {
		let inputFormat: string | undefined;
		try {
			inputFormat = await this.getInputFormatFromHeaders(url);
		} catch {
			inputFormat = undefined;
		}

		try {
			// Используем увеличенные таймауты для всех аудио-запросов
			const requestOptions = {
				method: "GET" as const,
				headersTimeout: 30000, // 30 секунд для всех запросов
				bodyTimeout: 120000, // 2 минуты для всех запросов
			};

			if (inputFormat === "opus" || inputFormat === "ogg") {
				const body = await safeRequestStream(url, requestOptions);
				return { stream: body, type: StreamType.OggOpus };
			} else if (inputFormat === "webm") {
				const body = await safeRequestStream(url, requestOptions);
				return { stream: body, type: StreamType.WebmOpus };
			} else {
				const processed = await this.createAudioStreamFromUrl(url);
				return { stream: processed, type: StreamType.Raw };
			}
		} catch (err) {
			const error = err as Error;

			// Специальная обработка для ошибок прерывания
			if (
				error.name === "AbortError" ||
				error.message.includes("aborted") ||
				error.message.includes("Request aborted")
			) {
				this.emit("debug", `Audio request aborted for ${url}`);
				throw new Error(`Audio request was cancelled`);
			}

			this.emit("error", error);
			throw err;
		}
	}

	async destroyCurrentStreamSafe(): Promise<void> {
		if (this.currentFFmpegCommand) {
			await this.ffmpegManager
				.terminateProcess(this.currentFFmpegCommand)
				.catch(() => {});
			this.currentFFmpegCommand = null;
		}

		if (this.currentInputStream) {
			this.currentInputStream.removeAllListeners();
			this.currentInputStream.destroy();
			this.currentInputStream = null;
		}

		if (this.processor) {
			this.processor.removeAllListeners();
			this.processor.end();
			this.processor = null;
		}
	}

	async destroy(): Promise<void> {
		await this.ffmpegManager.terminateAll();
		this.processor = null;
		this.removeAllListeners();
	}
}
