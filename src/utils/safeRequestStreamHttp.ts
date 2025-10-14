import { request } from "undici"
import type { Readable } from "stream"

/**
 * Default browser-like headers to avoid being blocked by services like Yandex Music
 */
const DEFAULT_HEADERS = {
  Accept: "*/*",
  "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "identity",
  Connection: "keep-alive",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
} as const

/**
 * Request options for safe streaming
 */
interface SafeRequestOptions {
  method?: "GET" | "HEAD" | "POST"
  headersTimeout?: number
  bodyTimeout?: number
  headers?: Record<string, string>
  maxRedirects?: number
}

/**
 * Merge user headers with default browser-like headers.
 * User headers take precedence over defaults.
 *
 * @param userHeaders - Custom headers provided by user
 * @returns Merged headers object
 */
function mergeHeaders(userHeaders?: Record<string, string>): Record<string, string> {
  return {
    ...DEFAULT_HEADERS,
    ...userHeaders,
  }
}

/**
 * Safely request a stream with proper error handling and browser-like headers.
 * Automatically adds default headers to avoid being blocked by services.
 *
 * @param url - URL to request
 * @param options - Request options
 * @returns Readable stream
 *
 * @example
 * \`\`\`typescript
 * // Basic usage
 * const stream = await safeRequestStream('https://example.com/audio.mp3', {
 *   headersTimeout: 15000,
 *   bodyTimeout: 120000
 * });
 *
 * // With custom headers (merged with defaults)
 * const stream = await safeRequestStream('https://music.yandex.ru/...', {
 *   headers: {
 *     'User-Agent': 'YandexMusicDesktopAppWindows/5.13.2',
 *     'X-Yandex-Music-Client': 'YandexMusicDesktopAppWindows/5.13.2'
 *   }
 * });
 * \`\`\`
 */
export async function safeRequestStream(url: string, options: SafeRequestOptions = {}): Promise<Readable> {
  const { method = "GET", headersTimeout = 15000, bodyTimeout = 120000, headers} = options

  const mergedHeaders = mergeHeaders(headers)

  try {
    const response = await request(url, {
      method,
      headersTimeout,
      bodyTimeout,
      headers: mergedHeaders,
    })

    const contentType = response.headers["content-type"] as string | undefined

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`HTTP ${response.statusCode}: Request failed`)
    }

    if (contentType && !isAudioContentType(contentType)) {
      // Read first 1KB of response to log what we got
      const chunks: Buffer[] = []
      let totalSize = 0
      const maxSize = 1024 // 1KB

      for await (const chunk of response.body) {
        chunks.push(chunk as Buffer)
        totalSize += (chunk as Buffer).length
        if (totalSize >= maxSize) break
      }

      throw new Error(
        `Invalid Content-Type: ${contentType}. Expected audio/* but got ${contentType}. This usually means the URL returned an error page or requires authentication.`,
      )
    }

    return response.body as Readable
  } catch (error) {
    const err = error as Error
    throw new Error(`Failed to request stream from ${url}: ${err.message}`)
  }
}

/**
 * Request a stream with automatic retry logic for transient failures.
 * Retries on network errors, timeouts, and 5xx server errors.
 *
 * @param url - URL to request
 * @param options - Request options
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param retryDelay - Delay between retries in ms (default: 1000)
 * @returns Readable stream
 *
 * @example
 * \`\`\`typescript
 * // With automatic retry
 * const stream = await safeRequestStreamWithRetry('https://example.com/audio.mp3', {
 *   headers: {
 *     'User-Agent': 'YandexMusicDesktopAppWindows/5.13.2'
 *   }
 * }, 3, 1000);
 * \`\`\`
 */
export async function safeRequestStreamWithRetry(
  url: string,
  options: SafeRequestOptions = {},
  maxRetries = 3,
  retryDelay = 1000,
): Promise<Readable> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await safeRequestStream(url, options)
    } catch (error) {
      lastError = error as Error
      const isRetryable = isRetryableError(lastError)

      // Don't retry on last attempt or non-retryable errors
      if (attempt === maxRetries || !isRetryable) {
        break
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = retryDelay * Math.pow(2, attempt)
      await sleep(delay)
    }
  }

  throw new Error(`Failed after ${maxRetries + 1} attempts: ${lastError?.message}`)
}

/**
 * Check if an error is retryable (network issues, timeouts, 5xx errors).
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase()
  return (
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("socket hang up") ||
    message.includes("http 5") || // 5xx errors
    message.includes("network")
  )
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Check if Content-Type indicates audio data.
 */
function isAudioContentType(contentType: string): boolean {
  const audioTypes = [
    "audio/",
    "application/ogg",
    "application/octet-stream",
    "video/webm", // WebM can contain audio
  ]

  const lowerType = contentType.toLowerCase()
  return audioTypes.some((type) => lowerType.includes(type))
}
