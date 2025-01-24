import { CommandInteraction } from "discord.js";
import type {
	LocaleMessages,
	LoggerMessages,
	SupportedLocale,
} from "../types/localization.js";
import { bot } from "../bot.js";

// TYPE
export type {
	SupportedLocale,
	LocaleMessages,
	LoggerMessages,
} from "../types/localization.js";

// FUNCTIONS
/*
 * Initialize language messages
 */
export const initializeLanguage = async () => {
	const loggerMessages = await initializeLoggerMessages();
	const messages = await initializeMessages();
	return { loggerMessages, messages };
};

/*
 * Initialize logger messages
 */
export const initializeLoggerMessages = async (): Promise<LoggerMessages> => {
	const locale = (process.env.BOT_LOCALE || "en") as SupportedLocale;
	const { LOGGER_MESSAGES } = await import(`../locales/${locale}.js`);
	return LOGGER_MESSAGES;
};

/*
 * Initialize messages
 */
export const initializeMessages = async (): Promise<LocaleMessages> => {
	const locale = (process.env.BOT_LOCALE || "en") as SupportedLocale;
	const { MESSAGES } = await import(`../locales/${locale}.js`);
	return MESSAGES;
};

/*
 * Set locale messages
 */
export const setLocaleMessages = async (
	interaction: CommandInteraction,
): Promise<void> => {
	const locale = interaction.guild?.preferredLocale;
	const { MESSAGES } = await import(`../locales/${locale || "en"}.js`);
	bot.messages = MESSAGES;
};
