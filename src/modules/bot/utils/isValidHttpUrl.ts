import { bot } from "../bot.js";

export function isValidHttpUrl(string: string): boolean {
	if (!string.includes("://")) {
		return false;
	}

	try {
		const url = new URL(string);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch (error) {
		bot.logger.debug(
			`${bot.locale.t("errors.url_processing", { url: string })}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}
