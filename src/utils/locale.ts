import path from "path";
import { dirname } from "dirname-filename-esm";
import { createLogger, ModuleState } from "./logger.js";
import fs from "fs/promises";

const __dirname = dirname(import.meta);
const logger = createLogger("locale");

type TranslationParams = {
	[key: string]: string | number;
};

type DotPaths<T> = T extends object
	? {
			[K in keyof T]: T[K] extends object
				? `${K & string}` | `${K & string}.${DotPaths<T[K]> & string}`
				: `${K & string}`;
		}[keyof T]
	: never;

export interface Locale<T = undefined> {
	t(key: DotPaths<T>, params?: TranslationParams): string;
}

interface LocalePrivate<T = unknown> extends Locale<T> {
	load(language?: string): Promise<void>;
	setLanguage(language: string): Promise<void>;
	setTranslations(translations: T): void;
}

export type LocaleType<T = unknown> = LocalePrivate<T>;

export function createLocale<T extends Record<string, unknown>>(
	moduleName: string,
): LocalePrivate<T> {
	const translations = new Map<string, T>();
	let currentLanguage = "en";

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
					logger.debug(`Path not found: ${fullPath}`);
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
		try {
			const localesPath = await findLocalesPath();
			if (!localesPath) {
				logger.error(`Locales directory not found for module ${moduleName}`);
				return
			}

			const filePath = path.join(localesPath, `${language}.json`);
			logger.debug(`Loading translations from: ${filePath}`);

			let content: string;
			content = await fs.readFile(filePath, "utf-8");

			translations.set(language, JSON.parse(content));
		} catch (error) {
			logger.error(
				`Failed to load ${language} translations: ${error instanceof Error ? error.stack : String(error)}`,
				{
					moduleState: ModuleState.ERROR,
					error: error instanceof Error ? error.stack : String(error),
				},
			);

			if (language !== "en") {
				await load("en");
				currentLanguage = "en";
			}
		}
	}

	async function setLanguage(language: string) {
		if (!translations.has(language)) await load(language);
		currentLanguage = translations.has(language) ? language : "en";
	}

	function t(key: DotPaths<T>, params?: TranslationParams): string {
		const trans = translations.get(currentLanguage) || translations.get("en");
		if (!trans) return key;

		const value = String(key)
			.split(".")
			.reduce<unknown>(
				(obj, k) =>
					obj && typeof obj === "object"
						? (obj as Record<string, unknown>)[k]
						: undefined,
				trans,
			);

		if (typeof value !== "string") return key;
		return params
			? value.replace(/{(\w+)}/g, (_, k) => params[k]?.toString() ?? `{${k}}`)
			: value;
	}

	function setTranslations(newTranslations: T): void {
		translations.set(currentLanguage, newTranslations);
	}

	return {
		load,
		setLanguage,
		t,
		setTranslations,
	};
}
