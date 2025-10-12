import { EventEmitter } from "eventemitter3";
import { type Readable, PassThrough } from "stream";
import { pipeline as nodePipeline } from "stream/promises";
import { promisify } from "util";
import { execa, type Subprocess } from "execa";

const pipeline = promisify(nodePipeline) as unknown as typeof nodePipeline;

export interface SimpleFFmpegOptions {
	ffmpegPath?: string;
	failFast?: boolean;
	extraGlobalArgs?: string[];
	abortSignal?: AbortSignal;
	loggerTag?: string;
	timeout?: number;
	maxStderrBuffer?: number;
	enableProgressTracking?: boolean;
	logger?: {
		debug: (message: string, meta?: any) => void;
		warn: (message: string, meta?: any) => void;
		error: (message: string, meta?: any) => void;
	};
}

export interface FFmpegProgress {
	frame: number;
	fps: number;
	bitrate: string;
	totalSize: number;
	outTimeUs: number;
	outTime: string;
	dupFrames: number;
	dropFrames: number;
	speed: number;
	progress: string;
}

export interface FFmpegStats {
	startTime: Date;
	endTime?: Date;
	duration?: number;
	exitCode?: number;
	signal?: string;
	stderrLines: number;
	bytesProcessed: number;
}

/**
 * Improved SimpleFFmpeg wrapper:
 * - supports multiple input streams using additional pipe fds (pipe:3, pipe:4 ...)
 * - robust stderr buffering and progressive parsing (handles chunked lines)
 * - better cleanup and lifecycle events (start, progress, data, end, terminated, error, close)
 * - safer assignment of pid, and better typings
 */
export class SimpleFFmpeg extends EventEmitter {
	private process: Subprocess | null = null;
	private args: string[] = [];
	private inputStreams: Array<{ stream: Readable; index: number }> = [];
	private outputStream: PassThrough | null = null;
	private stderrBuffer = ""; // used for line-accumulation only
	private stderrAll = ""; // used to keep limited history for errors
	private isTerminating = false;
	private finished = false;
	private stats: FFmpegStats;

	private doneResolve!: () => void;
	private doneReject!: (err: Error) => void;
	private donePromise: Promise<void>;

	private readonly config: Required<
		Omit<SimpleFFmpegOptions, "abortSignal">
	> & {
		abortSignal?: AbortSignal;
	};
	private timeoutHandle?: NodeJS.Timeout;

	private _pid: number | null = null;
	public get pid(): number | null {
		return this._pid;
	}

	constructor(options: SimpleFFmpegOptions = {}) {
		super();

		this.config = {
			ffmpegPath: options.ffmpegPath ?? "ffmpeg",
			failFast: options.failFast ?? false,
			extraGlobalArgs: options.extraGlobalArgs ?? [],
			loggerTag: options.loggerTag ?? `ffmpeg_${Date.now()}`,
			timeout: options.timeout ?? 0,
			maxStderrBuffer: options.maxStderrBuffer ?? 1024 * 1024,
			enableProgressTracking: options.enableProgressTracking ?? false,
			logger: options.logger ?? console,
			abortSignal: options.abortSignal,
		};

		this.stats = {
			startTime: new Date(),
			stderrLines: 0,
			bytesProcessed: 0,
		};

		this.donePromise = new Promise<void>((res, rej) => {
			this.doneResolve = () => {
				if (!this.finished) {
					this.finished = true;
					res();
				}
			};
			this.doneReject = (err: Error) => {
				if (!this.finished) {
					this.finished = true;
					rej(err);
				}
			};
		});

		this.setupAbortSignal();
		this.setupInitialArgs();
	}

	private setupAbortSignal(): void {
		if (this.config.abortSignal) {
			if (this.config.abortSignal.aborted) {
				this.kill("SIGTERM");
			} else {
				this.config.abortSignal.addEventListener(
					"abort",
					() => this.kill("SIGTERM"),
					{ once: true },
				);
			}
		}
	}

	private setupInitialArgs(): void {
		if (this.config.extraGlobalArgs.length > 0) {
			this.args.push(...this.config.extraGlobalArgs);
		}
		if (this.config.failFast) {
			this.args.push("-xerror");
		}
		if (this.config.enableProgressTracking) {
			// -progress pipe:2 writes a key=value stream to fd 2 (stderr); we parse it
			this.args.push("-progress", "pipe:2");
		}
	}

	// Fluent API methods
	input(input: string | Readable): this {
		if (typeof input === "string") {
			this.args.push("-i", input);
		} else {
			const index = this.inputStreams.length;
			this.inputStreams.push({ stream: input, index });
			// We will assign pipe fds later when starting the process. Use placeholder for clarity
			this.args.push("-i", `pipe:${3 + index}`);
		}
		return this;
	}

	inputs(input: string | Readable): this {
		return this.input(input);
	}

	inputOptions(...opts: string[]): this {
		// Insert before the last -i argument
		const lastInputIndex = this.args.lastIndexOf("-i");
		if (lastInputIndex !== -1) {
			this.args.splice(lastInputIndex, 0, ...opts);
		} else {
			this.args.unshift(...opts);
		}
		return this;
	}

	outputOptions(...opts: string[]): this {
		this.args.push(...opts);
		return this;
	}

	options(...opts: string[]): this {
		return this.outputOptions(...opts);
	}

	output(output: string): this {
		this.args.push(output);
		return this;
	}

	videoCodec(codec: string): this {
		return this.outputOptions("-c:v", codec);
	}

	audioCodec(codec: string): this {
		return this.outputOptions("-c:a", codec);
	}

	videoBitrate(bitrate: string): this {
		return this.outputOptions("-b:v", bitrate);
	}

	audioBitrate(bitrate: string): this {
		return this.outputOptions("-b:a", bitrate);
	}

	size(size: string): this {
		return this.outputOptions("-s", size);
	}

	fps(fps: number): this {
		return this.outputOptions("-r", fps.toString());
	}

	duration(duration: string | number): this {
		const durationStr =
			typeof duration === "number" ? duration.toString() : duration;
		return this.outputOptions("-t", durationStr);
	}

	seek(time: string | number): this {
		const timeStr = typeof time === "number" ? time.toString() : time;
		return this.outputOptions("-ss", timeStr);
	}

	format(format: string): this {
		return this.outputOptions("-f", format);
	}

	overwrite(): this {
		return this.outputOptions("-y");
	}

	noOverwrite(): this {
		return this.outputOptions("-n");
	}

	private finish(err?: Error): void {
		if (this.timeoutHandle) {
			clearTimeout(this.timeoutHandle);
		}

		this.stats.endTime = new Date();
		this.stats.duration =
			this.stats.endTime.getTime() - this.stats.startTime.getTime();

		if (err) {
			this.doneReject(err);
		} else {
			this.doneResolve();
		}

		// ensure close event is emitted once
		setImmediate(() => this.emit("close"));
	}

	private isIgnorableError(error: any): boolean {
		const msg = (error?.message || "").toLowerCase();
		return (
			error?.code === "EPIPE" ||
			msg.includes("sigkill") ||
			msg.includes("sigterm") ||
			msg.includes("was killed") ||
			msg.includes("premature close") ||
			msg.includes("err_stream_premature_close") ||
			msg.includes("other side closed") ||
			msg.includes("econnreset") ||
			msg.includes("socketerror") ||
			msg.includes("timeout") ||
			msg.includes("request aborted") ||
			msg.includes("aborted")
		);
	}

	private cleanup(): void {
		try {
			this.outputStream?.destroy();
			this.process?.stdin?.destroy();
			this.process?.stdout?.destroy();
			this.process?.stderr?.destroy();
		} catch (e) {
			this.config.logger.debug(`[SimpleFFmpeg] Cleanup error (ignored):`, e);
		}
	}

	private parseProgressChunked(chunk: string): Array<Partial<FFmpegProgress>> {
		// Accumulate and split into lines; keep remainder in stderrBuffer
		this.stderrBuffer += chunk;
		const lines = this.stderrBuffer.split(/\r?\n/);
		// Last line may be incomplete — keep it
		this.stderrBuffer = lines.pop() ?? "";

		const progressUpdates: Array<Partial<FFmpegProgress>> = [];
		for (const line of lines) {
			if (!line.includes("=")) continue;
			const parsed = this.parseProgress(line);
			if (parsed) progressUpdates.push(parsed);
		}
		return progressUpdates;
	}

	private parseProgress(line: string): Partial<FFmpegProgress> | null {
		const progress: Partial<FFmpegProgress> = {};
		const parts = line.split(/\s+/).join(" ").split("=");
		// naive pair reading: key=value key2=value2 ... but pairs can appear across lines — we call this per-line
		for (let i = 0; i < parts.length - 1; i += 2) {
			const key = parts[i].trim();
			let value = parts[i + 1].trim();
			// value might contain another key (e.g. "123 frame=456"), keep only up to first space
			if (value.includes(" ")) {
				value = value.split(" ")[0];
			}
			switch (key) {
				case "frame":
					progress.frame = Number.parseInt(value, 10);
					break;
				case "fps":
					progress.fps = Number.parseFloat(value);
					break;
				case "bitrate":
					progress.bitrate = value;
					break;
				case "total_size":
					progress.totalSize = Number.parseInt(value, 10);
					break;
				case "out_time_us":
					progress.outTimeUs = Number.parseInt(value, 10);
					break;
				case "out_time":
					progress.outTime = value;
					break;
				case "dup_frames":
					progress.dupFrames = Number.parseInt(value, 10);
					break;
				case "drop_frames":
					progress.dropFrames = Number.parseInt(value, 10);
					break;
				case "speed":
					progress.speed = Number.parseFloat(value.replace(/x$/, ""));
					break;
				case "progress":
					progress.progress = value;
					break;
			}
		}

		return Object.keys(progress).length > 0 ? progress : null;
	}

	run(): { output: PassThrough; done: Promise<void> } {
		if (this.process) {
			throw new Error("FFmpeg process is already running");
		}

		this.outputStream = new PassThrough();
		const fullCmd = `${this.config.ffmpegPath} ${this.args.join(" ")}`;

		this.emit("start", fullCmd);
		this.config.logger.debug(`[SimpleFFmpeg] Starting: ${fullCmd}`, {
			tag: this.config.loggerTag,
		});

		// Build stdio array: [stdin, stdout, stderr, ...extra pipes for inputs]
		const extraPipes = this.inputStreams.length;
		const stdio = [
			"pipe", // stdin
			"pipe", // stdout
			"pipe", // stderr
			...Array(extraPipes).fill("pipe"), // fd3, fd4, ...
		] as const;

		this.process = execa(this.config.ffmpegPath, this.args, {
			reject: false,
			all: false,
			stdin: stdio[0],
			stdout: stdio[1],
			stderr: stdio[2],
			// execa supports a `stdio` array which we prepared above. Pass it directly to ensure extra pipes exist.
			// @ts-ignore - execa's typing may not accept a mixed tuple easily here.
			stdio,
		});

		this._pid = this.process.pid ?? null;
		this.config.logger.debug(`[SimpleFFmpeg] PID: ${this.pid}`, {
			tag: this.config.loggerTag,
		});

		// Setup timeout
		if (this.config.timeout > 0) {
			this.timeoutHandle = setTimeout(() => {
				this.config.logger.warn(
					`[SimpleFFmpeg] Process timeout after ${this.config.timeout}ms`,
				);
				this.kill("SIGTERM");
			}, this.config.timeout);
		}

		this.setupInputStreams();
		this.setupOutputStreams();
		this.setupProcessEvents();

		return { output: this.outputStream, done: this.donePromise };
	}

	private async setupInputStreams(): Promise<void> {
		if (!this.process) return;

		if (this.inputStreams.length === 0) return;

		// Map each input stream to corresponding fd: first user-provided stream was assigned to pipe:3
		for (const { stream, index } of this.inputStreams) {
			const fd = 3 + index; // matches earlier placeholder pipe:<fd>
			const childStream = (this.process as any).stdio?.[fd] as
				| NodeJS.WritableStream
				| undefined;

			if (!childStream) {
				// As fallback, use stdin for the first stream if available
				if (index === 0 && this.process.stdin) {
					await pipeline(
						stream,
						this.process.stdin as NodeJS.WritableStream,
					).catch((err) => {
						if (!this.isIgnorableError(err)) {
							this.config.logger.error(`[SimpleFFmpeg] Pipeline failed:`, err);
							this.emit("error", err as Error);
						}
					});
					continue;
				}
				this.config.logger.warn(
					`[SimpleFFmpeg] No child fd for input ${index}, input may fail`,
					{
						tag: this.config.loggerTag,
					},
				);
				continue;
			}

			stream.once("close", () => {
				try {
					// some child fds require explicit end
					if ((childStream as any).end) (childStream as any).end();
				} catch (e) {}
			});

			stream.on("error", (err) => {
				if (!this.isIgnorableError(err)) {
					this.config.logger.error(`[SimpleFFmpeg] Input stream error:`, err);
					this.emit("error", err);
				}
			});

			(childStream as NodeJS.WritableStream).on("error", (err: any) => {
				if (!this.isIgnorableError(err)) {
					this.config.logger.error(`[SimpleFFmpeg] child fd write error:`, err);
					this.emit("error", err);
				}
			});

			// start piping
			pipeline(stream, childStream as NodeJS.WritableStream).catch((err) => {
				if (!this.isIgnorableError(err)) {
					this.config.logger.error(`[SimpleFFmpeg] Pipeline failed:`, err);
					this.emit("error", err as Error);
				}
			});
		}
	}

	private setupOutputStreams(): void {
		if (!this.process || !this.outputStream) return;

		this.process.stdout?.on("error", (e) =>
			this.config.logger.debug(`[SimpleFFmpeg] stdout error:`, e),
		);

		this.process.stdout?.on("data", (chunk: Buffer) => {
			this.stats.bytesProcessed += chunk.length;
			this.emit("data", chunk);
		});

		if (this.process.stdout) {
			pipeline(
				this.process.stdout as NodeJS.ReadableStream,
				this.outputStream,
			).catch((err) => {
				if (!this.isIgnorableError(err)) {
					this.config.logger.error(
						`\[SimpleFFmpeg] Output pipeline failed:`,
						err,
					);
					this.emit("error", err);
				}
			});
		}

		this.process.stderr?.on("data", (chunk: Buffer) => {
			const txt = chunk.toString("utf-8");
			this.stats.stderrLines++;

			// Maintain bounded stderrAll for error reporting
			this.stderrAll += txt;
			if (this.stderrAll.length > this.config.maxStderrBuffer) {
				this.stderrAll = this.stderrAll.slice(-this.config.maxStderrBuffer);
			}

			if (this.config.enableProgressTracking) {
				const updates = this.parseProgressChunked(txt);
				for (const upd of updates) {
					this.emit("progress", upd);
				}
			}

			if (process.env.STDERR_LOG) {
				this.config.logger.debug(`[SimpleFFmpeg] stderr: ${txt.trim()}`, {
					tag: this.config.loggerTag,
				});
			}
		});

		this.process.stderr?.on("error", (e) =>
			this.config.logger.debug(`[SimpleFFmpeg] stderr error:`, e),
		);
	}

	private setupProcessEvents(): void {
		if (!this.process) return;

		this.process.once("exit", (code, signal) => {
			this.stats.exitCode = code ?? undefined;
			this.stats.signal = signal ?? undefined;

			this.config.logger.debug(
				`[SimpleFFmpeg] Exit code ${code}, signal ${signal}`,
				{
					tag: this.config.loggerTag,
				},
			);

			this.cleanup();

			const stderrSnippet = this.stderrAll.trim().slice(0, 2000);
			if ((code === 0 && !this.isTerminating) || this.isTerminating) {
				if (this.isTerminating) {
					this.emit("terminated", signal ?? "SIGTERM");
				}
				this.emit("end");
				this.finish();
			} else {
				let msg = `FFmpeg exited with code ${code}`;
				if (signal) msg += `, signal ${signal}`;
				if (stderrSnippet) {
					msg += `, stderr: ${stderrSnippet.replace(/\n/g, " ")}`;
				}
				const err = new Error(msg);
				this.emit("error", err);
				this.finish(err);
			}
		});

		this.process.once("error", (err: Error) => {
			if (!this.isTerminating || !this.isIgnorableError(err)) {
				this.config.logger.error(`[SimpleFFmpeg] Process error:`, err);
				this.emit("error", err);
				this.finish(err);
			}
		});

		// execa exposes a `cancel` method on the returned child. Hook to kill.
		try {
			if ((this.process as any).cancel) {
				(this.process as any).cancel = ((orig: any) => {
					return (...args: any[]) => {
						this.kill("SIGTERM");
						return orig.apply(this.process, args);
					};
				})((this.process as any).cancel);
			}
		} catch (e) {
			// ignore
		}
	}

	kill(signal: NodeJS.Signals = "SIGTERM"): void {
		if (this.process && !this.isTerminating) {
			this.isTerminating = true;
			try {
				this.cleanup();
				this.process.kill(signal);
			} catch (e) {
				this.config.logger.debug(`[SimpleFFmpeg] Kill error (ignored):`, e);
			}
		}
	}

	toString(): string {
		return `${this.config.ffmpegPath} ${this.args.join(" ")}`;
	}

	getArgs(): string[] {
		return [...this.args];
	}

	getStats(): FFmpegStats {
		return { ...this.stats };
	}

	isRunning(): boolean {
		return this.process !== null && !this.finished;
	}

	get done(): Promise<void> {
		return this.donePromise;
	}

	// Enhanced event typing
	override on(event: "start", listener: (cmd: string) => void): this;
	override on(event: "end", listener: () => void): this;
	override on(
		event: "terminated",
		listener: (signal: NodeJS.Signals | string) => void,
	): this;
	override on(event: "error", listener: (error: Error) => void): this;
	override on(event: "data", listener: (chunk: Buffer) => void): this;
	override on(
		event: "progress",
		listener: (progress: Partial<FFmpegProgress>) => void,
	): this;
	override on(event: "close", listener: () => void): this;
	override on(event: "exit", listener: () => void): this;
	override on(event: string, listener: (...args: any[]) => void): this {
		return super.on(event, listener);
	}
}
