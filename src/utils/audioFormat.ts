/**
 * Audio format detection utilities
 */

/**
 * Map MIME types to FFmpeg input formats
 */
const MIME_TO_FORMAT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
  "audio/x-aac": "aac",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "application/ogg": "ogg",
}

/**
 * Map file extensions to FFmpeg input formats
 */
const EXTENSION_TO_FORMAT: Record<string, string> = {
  mp3: "mp3",
  ogg: "ogg",
  opus: "opus",
  webm: "webm",
  wav: "wav",
  flac: "flac",
  aac: "aac",
  m4a: "m4a",
  mp4: "mp4",
}

/**
 * Get FFmpeg input format from MIME type
 *
 * @param mimeType - Content-Type header value
 * @returns FFmpeg format string or undefined
 */
export function getInputFormatFromMimeType(mimeType?: string): string | undefined {
  if (!mimeType) return undefined

  // Extract base MIME type (remove charset and other parameters)
  const baseMimeType = mimeType.split(";")[0].trim().toLowerCase()

  return MIME_TO_FORMAT[baseMimeType]
}

/**
 * Get FFmpeg input format from URL file extension
 *
 * @param url - Audio source URL
 * @returns FFmpeg format string or undefined
 */
export function getInputFormatFromUrl(url: string): string | undefined {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname.toLowerCase()

    // Extract extension from pathname
    const match = pathname.match(/\.([a-z0-9]+)(?:\?|$)/i)
    if (!match) return undefined

    const extension = match[1]
    return EXTENSION_TO_FORMAT[extension]
  } catch {
    return undefined
  }
}

/**
 * Detect audio format from multiple sources (MIME type, URL, etc.)
 *
 * @param mimeType - Content-Type header value
 * @param url - Audio source URL
 * @returns FFmpeg format string or undefined
 */
export function detectAudioFormat(mimeType?: string, url?: string): string | undefined {
  // Try MIME type first (most reliable)
  const formatFromMime = getInputFormatFromMimeType(mimeType)
  if (formatFromMime) return formatFromMime

  // Fallback to URL extension
  if (url) {
    const formatFromUrl = getInputFormatFromUrl(url)
    if (formatFromUrl) return formatFromUrl
  }

  return undefined
}
