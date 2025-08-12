import { request } from "undici";
import type { Readable } from "readable-stream";
import { bot } from "../bot.js";

interface RequestOptions {
	method?: string;
	headers?: Record<string, string>;
	headersTimeout?: number;
	bodyTimeout?: number;
	signal?: AbortSignal;
}

const MAX_REDIRECTS = 5;

// region: helpers

function isAbortError(error: unknown): boolean {
	const err = error as Error | undefined;
	if (!err) return false;
	const message = (err.message || "").toLowerCase();
	return (
		err.name === "AbortError" ||
		message.includes("aborted") ||
		message.includes("request aborted")
	);
}

function isTimeoutError(error: unknown): boolean {
	const err = error as Error & { code?: string };
	const message = (err?.message || "").toLowerCase();
	return (
		message.includes("timeout") ||
		message.includes("connect timeout") ||
		err?.code === "UND_ERR_CONNECT_TIMEOUT"
	);
}

function isConnectionError(error: unknown): boolean {
	const err = error as Error & { code?: string };
	const message = (err?.message || "").toLowerCase();
	return (
		message.includes("enotfound") ||
		message.includes("econnrefused") ||
		message.includes("econnreset") ||
		message.includes("other side closed") ||
		message.includes("socketerror") ||
		message.includes("connect timeout error") ||
		err?.code === "UND_ERR_CONNECT_TIMEOUT"
	);
}

function safelyDestroy(
	stream: Readable | null | undefined,
	urlForLog?: string,
): void {
	if (!stream) return;
	try {
		// Attach a temporary error listener to prevent uncaught 'error' during destroy
		const onError = (error: unknown) => {
			if (isAbortError(error)) {
				bot?.logger.debug(
					`[safeRequestStream] Stream already aborted${urlForLog ? ` for ${urlForLog}` : ""}`,
				);
			} else {
				bot?.logger.debug(
					`[safeRequestStream] Error during safe destroy${urlForLog ? ` for ${urlForLog}` : ""}: ${(error as Error).message}`,
				);
			}
		};

		// Ensure the temporary handler is removed when the stream closes
		stream.once("error", onError);
		stream.once("close", () => {
			try {
				stream.removeListener("error", onError);
			} catch {}
		});

		if (!stream.destroyed) {
			stream.destroy();
		}
	} catch (error) {
		if (isAbortError(error)) {
			bot?.logger.debug(
				`[safeRequestStream] Stream already aborted${urlForLog ? ` for ${urlForLog}` : ""}`,
			);
		} else {
			bot?.logger.debug(
				`[safeRequestStream] Error during safe destroy${urlForLog ? ` for ${urlForLog}` : ""}: ${(error as Error).message}`,
			);
		}
	}
}

function ensureNotAborted(signal: AbortSignal | undefined, url: string): void {
	if (signal?.aborted) {
		bot?.logger.debug(`[safeRequestStream] Request already aborted for ${url}`);
		throw new Error(`Request aborted for ${url}`);
	}
}

function resolveRedirectUrl(
	currentUrl: string,
	locationHeader: string | string[],
): string {
	let location = Array.isArray(locationHeader)
		? locationHeader[0]
		: locationHeader;
	if (typeof location !== "string") {
		throw new Error(`Invalid redirect location for ${currentUrl}`);
	}
	if (!location.startsWith("http")) {
		try {
			location = new URL(location, currentUrl).toString();
		} catch {
			throw new Error(
				`Invalid redirect URL construction for ${currentUrl} -> ${location}`,
			);
		}
	}
	return location;
}

// endregion

export async function safeRequestStream(
	url: string,
	options: RequestOptions = {},
	redirectCount = 0,
): Promise<Readable> {
	// Увеличиваем таймауты для всех URL, так как они могут содержать аудио-файлы
	// Особенно важно для больших файлов или медленных соединений
	const defaultHeadersTimeout = 30000; // 30 секунд для всех запросов
	const defaultBodyTimeout = 120000; // 2 минуты для всех запросов

	const {
		method = "GET",
		headers = {},
		headersTimeout = defaultHeadersTimeout,
		bodyTimeout = defaultBodyTimeout,
		signal,
	} = options;

	if (redirectCount > MAX_REDIRECTS) {
		throw new Error(`Too many redirects for ${url}`);
	}

	// Check if request was already aborted
	if (signal?.aborted) {
		throw new Error(`Request aborted before starting for ${url}`);
	}

	let req: Awaited<ReturnType<typeof request>>;

	try {
		req = await request(url, {
			method,
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; AudioBot/1.0)",
				...headers,
			},
			headersTimeout,
			bodyTimeout,
			signal,
		});
	} catch (error) {
		const err = error as Error & { code?: string };

		if (isAbortError(err)) {
			bot?.logger.debug(`[safeRequestStream] Request aborted for ${url}`);
			throw new Error(`Request aborted for ${url}`);
		}

		if (isTimeoutError(err)) {
			bot?.logger.debug(
				`[safeRequestStream] Request timeout for ${url} (headersTimeout: ${headersTimeout}ms, bodyTimeout: ${bodyTimeout}ms)`,
			);
			throw new Error(`Request timeout for ${url}`);
		}

		if (isConnectionError(err)) {
			bot?.logger.debug(
				`[safeRequestStream] Connection error for ${url}: ${err.message}`,
			);
			throw new Error(`Connection failed for ${url}`);
		}

		bot?.logger.debug(
			`[safeRequestStream] Request failed for ${url}: ${err.message}`,
		);
		throw new Error(`Request failed for ${url}: ${err.message}`);
	}

	const { statusCode, body } = req;

	// Handle redirects
	if (
		statusCode &&
		statusCode >= 300 &&
		statusCode < 400 &&
		req.headers.location
	) {
		ensureNotAborted(signal, url);
		safelyDestroy(body as unknown as Readable, url);

		const nextUrl = resolveRedirectUrl(url, req.headers.location);
		bot?.logger.debug(
			`[safeRequestStream] Redirecting from ${url} to ${nextUrl}`,
		);
		return safeRequestStream(nextUrl, options, redirectCount + 1);
	}

	// Handle HTTP errors
	if (statusCode && (statusCode < 200 || statusCode >= 300)) {
		ensureNotAborted(signal, url);
		safelyDestroy(body as unknown as Readable, url);
		throw new Error(`HTTP Error: ${statusCode} for ${url}`);
	}

	// Set up error handling for the body stream
	const safeBody = body as unknown as Readable;

	// Track if the stream has been destroyed to prevent multiple destroy calls
	let isDestroyed = false;

	const destroySafely = () => {
		if (isDestroyed) return;
		isDestroyed = true;
		safelyDestroy(safeBody, url);
	};

	// Handle stream errors
	safeBody.on("error", (error) => {
		const err = error as Error & { code?: string };
		const message = (err.message || "").toLowerCase();
		const code = (err.code || "").toString().toLowerCase();

		if (isAbortError(err)) {
			bot?.logger.debug(`[safeRequestStream] Stream aborted for ${url}`);
		} else if (message.includes("econnreset")) {
			bot?.logger.debug(`[safeRequestStream] Connection reset for ${url}`);
		} else if (message.includes("other side closed")) {
			bot?.logger.debug(
				`[safeRequestStream] Connection closed by server for ${url}`,
			);
		} else if (message.includes("socketerror")) {
			bot?.logger.debug(`[safeRequestStream] Socket error for ${url}`);
		} else if (message.includes("socket hang up")) {
			bot?.logger.debug(`[safeRequestStream] Socket hang up for ${url}`);
		} else if (message.includes("timeout")) {
			bot?.logger.debug(`[safeRequestStream] Stream timeout for ${url}`);
		} else if (
			message.includes("premature close") ||
			message.includes("err_stream_premature_close") ||
			code === "err_stream_premature_close"
		) {
			bot?.logger.debug(
				`[safeRequestStream] Premature close (ignored) for ${url}: ${err.message}`,
			);
		} else if (
			message.includes("epipe") ||
			message.includes("write after end")
		) {
			bot?.logger.debug(
				`[safeRequestStream] Benign stream error (ignored) for ${url}: ${err.message}`,
			);
		} else {
			bot?.logger.error(
				`[safeRequestStream] Stream error for ${url}: ${err.message}`,
			);
		}

		destroySafely();
	});

	// Handle stream close
	safeBody.on("close", () => {
		bot?.logger.debug(`[safeRequestStream] Stream closed for ${url}`);
	});

	// Handle stream end
	safeBody.on("end", () => {
		bot?.logger.debug(`[safeRequestStream] Stream ended for ${url}`);
	});

	// Handle abort signal if provided
	if (signal) {
		const onAbort = () => {
			bot?.logger.debug(`[safeRequestStream] Abort signal received for ${url}`);
			destroySafely();
		};

		if (signal.aborted) {
			onAbort();
			throw new Error(`Request aborted for ${url}`);
		}

		signal.addEventListener("abort", onAbort, { once: true });

		// Clean up the abort listener when stream ends
		safeBody.on("close", () => {
			signal.removeEventListener("abort", onAbort);
		});
	}

	bot?.logger.debug(
		`[safeRequestStream] Successfully created stream for ${url}`,
	);
	return safeBody;
}

// Helper function to create an AbortController with timeout
export function createTimeoutController(timeoutMs: number): AbortController {
	const controller = new AbortController();

	const timeoutId = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	// Clear timeout if request completes normally
	controller.signal.addEventListener(
		"abort",
		() => {
			clearTimeout(timeoutId);
		},
		{ once: true },
	);

	return controller;
}

// Helper function for retrying requests
export async function safeRequestStreamWithRetry(
	url: string,
	options: RequestOptions = {},
	maxRetries = 3,
	retryDelay = 1000,
): Promise<Readable> {
	let lastError: Error;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			bot?.logger.debug(
				`[safeRequestStream] Attempt ${attempt}/${maxRetries} for ${url}`,
			);
			return await safeRequestStream(url, options);
		} catch (error) {
			lastError = error as Error;

			// Don't retry on certain errors
			if (
				lastError.message.includes("aborted") ||
				lastError.message.includes("Request aborted") ||
				lastError.message.includes("Too many redirects") ||
				lastError.message.includes("Invalid redirect") ||
				lastError.message.includes("Video unavailable") ||
				lastError.message.includes("Private video") ||
				lastError.message.includes("No playable formats found")
			) {
				throw lastError;
			}

			// Для таймаутов и ошибок подключения - повторяем с увеличенной задержкой
			const isRetryableError =
				lastError.message.includes("timeout") ||
				lastError.message.includes("Connect Timeout") ||
				lastError.message.includes("Connection failed") ||
				lastError.message.includes("ENOTFOUND") ||
				lastError.message.includes("ECONNREFUSED") ||
				lastError.message.includes("ECONNRESET") ||
				lastError.message.includes("SocketError") ||
				(lastError as Error & { code?: string }).code ===
					"UND_ERR_CONNECT_TIMEOUT";

			if (!isRetryableError) {
				throw lastError;
			}

			if (attempt < maxRetries) {
				const delay = retryDelay * Math.pow(2, attempt - 1); // Экспоненциальная задержка
				bot?.logger.debug(
					`[safeRequestStream] Retrying in ${delay}ms after error: ${lastError.message}`,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	throw lastError!;
}
