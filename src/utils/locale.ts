import logger from "./logger.js";
import { loadTranslation } from "./localeCache.js";

export type TranslationParams = {
	[key: string]: string | number;
};

export type DotPaths<T> = T extends object
	? {
			[K in keyof T]: T[K] extends object
				? `${K & string}` | `${K & string}.${DotPaths<T[K]> & string}`
				: `${K & string}`;
		}[keyof T]
	: never;

interface LocalePrivate<T = unknown> extends Locale<T> {
	load(language?: string): Promise<void>;
	setLanguageMessage(language: string): void;
	setLanguage(language: string): Promise<void>;
	setTranslations(translations: T): void;
	clearCache(): void;
}

export type LocaleType<T = unknown> = LocalePrivate<T>;

export interface Locale<T = undefined> {
	t(key: DotPaths<T>, params?: TranslationParams, lang?: string): string;
}

export function createLocale<T extends Record<string, unknown>>(
	moduleName: string,
	_options: { fastLangSwitch?: boolean } = {},
): LocalePrivate<T> {
	const translations = new Map<string, T>();
	const loadedLanguages = new Set<string>();
	let currentLanguage = "en";
	let messageLanguage = "en";

	async function load(language = "en") {
		// Check if already loaded
		if (loadedLanguages.has(language)) {
			return;
		}

		try {
			const data = await loadTranslation(moduleName, language);
			if (data) {
				translations.set(language, data);
				loadedLanguages.add(language);
			} else if (language !== "en") {
				// Fallback to English if available
				await load("en");
			}
		} catch (error) {
			logger.error(
				// `Failed to load ${language} translations for ${moduleName}:`,
				error,
			);
			if (language !== "en") {
				await load("en");
			}
		}
	}

	async function setLanguage(language: string) {
		if (!loadedLanguages.has(language)) {
			await load(language);
		}

		currentLanguage = translations.has(language) ? language : "en";
	}

	function setLanguageMessage(language: string): void {
		// Only load if not already loaded
		if (!loadedLanguages.has(language)) {
			// Async load in background, use fallback for now
			load(language).catch(() => {
				logger.warn(`Failed to load language ${language}, using fallback`);
			});

			// Use fallback language immediately
			if (!translations.has(language)) {
				language = "en";
			}
		}

		messageLanguage = language;

		// Only log language changes, not every call
		if (messageLanguage !== language) {
			logger.debug(`Message language changed to: ${language}`);
		}
	}

	function t(
		key: DotPaths<T>,
		params?: TranslationParams,
		lang?: string | boolean,
	): string {
		let targetLang: string;

		if (typeof lang === "boolean") {
			targetLang = lang ? messageLanguage : currentLanguage;
		} else {
			targetLang =
				(typeof lang === "string" ? lang : undefined) ??
				messageLanguage ??
				currentLanguage ??
				"en";
		}

		const trans = translations.get(targetLang) ?? translations.get("en");
		if (!trans) {
			// Only warn once per missing language
			if (!translations.has(targetLang)) {
				logger.warn(`No translations available for ${targetLang}`);
			}
			return key;
		}

		const value = String(key)
			.split(".")
			.reduce<unknown>(
				(obj, k) =>
					obj && typeof obj === "object"
						? (obj as Record<string, unknown>)[k]
						: undefined,
				trans,
			);

		if (typeof value !== "string") {
			return key;
		}

		return params
			? value.replace(/{(\w+)}/g, (_, k) => params[k]?.toString() ?? `{${k}}`)
			: value;
	}

	function setTranslations(newTranslations: T): void {
		translations.set(currentLanguage, newTranslations);
		loadedLanguages.add(currentLanguage);
	}

	function clearCache(): void {
		translations.clear();
		loadedLanguages.clear();
	}

	return {
		load,
		setLanguage,
		setLanguageMessage,
		t,
		setTranslations,
		clearCache,
	};
}

// Create a default locale instance for the main bot
export const locale = createLocale("ragu2", { fastLangSwitch: true });

// Pre-load default language
locale.load("en").catch((error) => {
	logger.error("Failed to load default locale:", error);
});
