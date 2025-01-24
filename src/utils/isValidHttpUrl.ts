import { bot } from "../bot.js";
import logger from "./logger.js";

export function isValidHttpUrl(string: string): boolean {
	let url;

	try {
		url = new URL(string);
	} catch (error) {
		logger.error(
			`${bot.loggerMessages.ERROR_PROCESSING_URL(string)}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}

	return url.protocol === "http:" || url.protocol === "https:";
}
