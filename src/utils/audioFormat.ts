/**
 * Determines audio format from mime-type
 */
export function getInputFormatFromMimeType(
	mimeType: string | undefined,
): string | undefined {
	if (!mimeType) return undefined;

	const formatMap: Record<string, string> = {
		mpeg: "mp3",
		flac: "flac",
		ogg: "ogg",
		wav: "wav",
		mp4: "m4a",
		aac: "m4a",
		opus: "opus",
	};

	for (const [key, format] of Object.entries(formatMap)) {
		if (mimeType.includes(key)) {
			return format;
		}
	}

	return undefined;
}
