import { createLogger } from "./logger.js";
import { loadTranslation } from "./localeCache.js";

const logger = createLogger("locale");

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

export interface Locale<TTranslations> {
	t(
		key: DotPaths<TTranslations>,
		params?: TranslationParams,
		lang?: string | boolean,
	): string;
}

interface LocalePrivate<TTranslations> extends Locale<TTranslations> {
	load(language?: string): Promise<void>;
	setLanguageMessage(language: string): void;
	setLanguage(language: string): Promise<void>;
	setTranslations(language: string, translations: TTranslations): void;
	clearCache(): void;
}

export type LocaleType<TTranslations> = LocalePrivate<TTranslations>;

type LocaleOptions = {
	defaultLanguage?: string;
	fastLangSwitch?: boolean;
	strict?: boolean;
};

function getNestedTranslation<TTranslations>(
	translations: TTranslations,
	key: string,
): unknown {
	return key.split(".").reduce<unknown>((obj, k) => {
		if (obj && typeof obj === "object") {
			return (obj as Record<string, unknown>)[k];
		}
		return undefined;
	}, translations);
}

export function createLocale<TTranslations = Record<string, unknown>>(
	moduleName: string,
	options: LocaleOptions = {},
): LocalePrivate<TTranslations> {
	const {
		defaultLanguage = "en",
		fastLangSwitch = false,
		strict = false,
	} = options;

	const translations = new Map<string, TTranslations>();
	const loadedLanguages = new Set<string>();
	const loadingPromises = new Map<string, Promise<void>>();

	let currentLanguage = defaultLanguage;
	let messageLanguage = defaultLanguage;

	async function load(language = defaultLanguage): Promise<void> {
		if (loadedLanguages.has(language)) {
			return;
		}

		const existingPromise = loadingPromises.get(language);
		if (existingPromise) {
			return existingPromise;
		}

		const loadPromise = (async () => {
			try {
				const data = await loadTranslation(moduleName, language);
				if (data) {
					translations.set(language, data as TTranslations);
					loadedLanguages.add(language);
				} else if (language !== defaultLanguage) {
					await load(defaultLanguage);
				}
			} catch (error) {
				logger.error(
					`Failed to load ${language} translations for ${moduleName}`,
					error,
				);
				if (language !== defaultLanguage) {
					await load(defaultLanguage);
				}
			} finally {
				loadingPromises.delete(language);
			}
		})();

		loadingPromises.set(language, loadPromise);
		return loadPromise;
	}

	async function setLanguage(language: string): Promise<void> {
		if (fastLangSwitch) {
			currentLanguage = language;
			if (!loadedLanguages.has(language)) {
				load(language).catch((error) => {
					logger.error(`Failed to load language ${language}`, error);
					if (currentLanguage === language) {
						currentLanguage = defaultLanguage;
					}
				});
			}
			return;
		}

		if (!loadedLanguages.has(language)) {
			await load(language);
		}

		currentLanguage = translations.has(language) ? language : defaultLanguage;
	}

	function setLanguageMessage(language: string): void {
		const requestedLanguage = language;

		if (!loadedLanguages.has(requestedLanguage)) {
			load(requestedLanguage).catch(() => {
				logger.warn(
					`Failed to load language ${requestedLanguage}, using fallback`,
				);
			});
		}

		const effectiveLanguage = translations.has(requestedLanguage)
			? requestedLanguage
			: defaultLanguage;

		if (messageLanguage !== effectiveLanguage) {
			messageLanguage = effectiveLanguage;
			logger.debug(`Message language changed to: ${effectiveLanguage}`);
		}
	}

	function t(
		key: DotPaths<TTranslations>,
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
				defaultLanguage;
		}

		const trans =
			translations.get(targetLang) ?? translations.get(defaultLanguage);

		if (!trans) {
			// if (!translations.has(targetLang)) {
			// 	const message = `No translations available for ${targetLang}`;
			// 	if (strict) {
			// 		throw new Error(message);
			// 	}
			// 	logger.warn(message);
			// }
			return String(key);
		}

		const rawValue = getNestedTranslation(trans, String(key));

		if (typeof rawValue !== "string") {
			if (strict) {
				logger.error(
					`Translation for key "${String(
						key,
					)}" in language "${targetLang}" is not a string`,
				);
			}
			return String(key);
		}

		if (!params) {
			return rawValue;
		}

		return rawValue.replace(
			/{(\w+)}/g,
			(_, k: string) => params[k]?.toString() ?? `{${k}}`,
		);
	}

	function setTranslations(
		language: string,
		newTranslations: TTranslations,
	): void {
		translations.set(language, newTranslations);
		loadedLanguages.add(language);
	}

	function clearCache(): void {
		translations.clear();
		loadedLanguages.clear();
		loadingPromises.clear();
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

export const locale = createLocale("ragu2", {
	defaultLanguage: "en",
	fastLangSwitch: true,
	strict: false,
});

locale.load("en").catch((error) => {
	logger.error("Failed to load default locale:", error);
});
