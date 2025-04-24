import path from "path";
import { dirname } from "dirname-filename-esm";
import { createLogger } from "./logger.js";
import fs from "fs/promises";

const __dirname = dirname(import.meta);
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
	options: { fastLangSwitch?: boolean } = {},
): LocalePrivate<T> {
	const translations = new Map<string, T>();
	const loadedLanguages = new Set<string>();
	let currentLanguage = "en";
	let messageLanguage = "en";
	const { fastLangSwitch = false } = options;

	/**
	 * Finds the correct path to locales directory with multiple fallback options
	 */
	async function findLocalesPath(): Promise<string | null> {
		logger.debug(`Current __dirname: ${__dirname}`);

		const searchBases = [
			path.join(__dirname, "../"),
			path.join(__dirname, "../../"),
			path.join(__dirname, "../../../"),
			path.join(__dirname, "../modules"),
			path.join(__dirname, "../../modules"),
			path.join(__dirname, "../../../modules"),
		];

		const localeLocations = ["src/locales", "locales"];

		for (const base of searchBases) {
			for (const loc of localeLocations) {
				const fullPath = path.join(base, moduleName, loc);

				try {
					await fs.access(fullPath);
					logger.debug(`Found locales at: ${fullPath}`);
					return fullPath;
				} catch (error) {
					logger.debug(`Path not found: ${fullPath} | ${error}`);
					continue;
				}
			}
		}

		logger.error(
			`Failed to find locales for module ${moduleName}. Checked paths:`,
		);
		searchBases.forEach((base) => {
			localeLocations.forEach((loc) => {
				logger.error(`- ${path.join(base, moduleName, loc)}`);
			});
		});

		return null;
	}

	async function load(language: string = "en") {
		if (fastLangSwitch && loadedLanguages.has(language)) {
			return;
		}

		try {
			const localesPath = await findLocalesPath();
			if (!localesPath) {
				logger.error(`Locales directory not found for module ${moduleName}`);
				return;
			}

			const filePath = path.join(localesPath, `${language}.json`);
			logger.debug(`Loading translations from: ${filePath}`);

			const content = await fs.readFile(filePath, "utf-8");
			translations.set(language, JSON.parse(content));
			loadedLanguages.add(language);
		} catch (error) {
			logger.error(`Failed to load ${language} translations: ${error}`);
			if (language !== "en") await load("en");
		}
	}

	async function setLanguage(language: string) {
		if (fastLangSwitch && loadedLanguages.has(language)) {
			currentLanguage = language;
			return;
		}

		if (!translations.has(language)) {
			await load(language);
		}
		currentLanguage = translations.has(language) ? language : "en";
		loadedLanguages.add(language);
	}

	function setLanguageMessage(language: string): void {
		if (fastLangSwitch && loadedLanguages.has(language)) {
			currentLanguage = language;
			return;
		}

		if (!translations.has(language)) {
			logger.warn(`Language ${language} not loaded, falling back to en`);
			language = "en";
		}
		messageLanguage = language;
		logger.debug(`Message language set to: ${language}`);
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
			logger.warn(`No translations for ${targetLang}, key: ${key}`);
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
			console.warn(`Translation value not found for key "${key}"`);
			return key;
		}

		return params
			? value.replace(/{(\w+)}/g, (_, k) => params[k]?.toString() ?? `{${k}}`)
			: value;
	}

	function setTranslations(newTranslations: T): void {
		translations.set(currentLanguage, newTranslations);
	}

	function clearCache(): void {
		translations.clear();
		loadedLanguages.clear();
	}

	if (translations.size > 10) {
		const oldestKey = translations.keys().next().value!;
		translations.delete(oldestKey);
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
