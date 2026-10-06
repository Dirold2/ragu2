import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLogger } from "dlog2";
import { getErrorMessage } from "./error.js";

const logger = createLogger("locale");
const DEFAULT_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = new Set(["en", "ru"]);

export type TranslationParams = Record<string, string | number>;

export type DotPaths<T> = T extends object
  ? {
      [K in keyof T]: T[K] extends object
        ? `${K & string}` | `${K & string}.${DotPaths<T[K]> & string}`
        : `${K & string}`;
    }[keyof T]
  : never;

export interface Locale<TTranslations> {
  load(language?: string): Promise<void>;
  setLanguageMessage(language: string): void;
  t(key: DotPaths<TTranslations>, params?: TranslationParams, lang?: string | boolean): string;
}

export function normalizeLocale(language: string | null | undefined): string {
  const baseLanguage = language?.split("-", 1)[0]?.toLowerCase();
  return baseLanguage && SUPPORTED_LANGUAGES.has(baseLanguage)
    ? baseLanguage
    : DEFAULT_LANGUAGE;
}

function getNestedTranslation<TTranslations>(translations: TTranslations, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => {
    if (value && typeof value === "object") return (value as Record<string, unknown>)[part];
    return undefined;
  }, translations);
}

export function createLocale<TTranslations = Record<string, unknown>>(): Locale<TTranslations> {
  const defaultLanguage = DEFAULT_LANGUAGE;
  const translations = new Map<string, TTranslations>();
  const loading = new Map<string, Promise<void>>();
  let messageLanguage = defaultLanguage;

  async function load(language = defaultLanguage): Promise<void> {
    const targetLanguage = normalizeLocale(language);
    if (translations.has(targetLanguage)) return;
    const pending = loading.get(targetLanguage);
    if (pending) return pending;

    const promise = readFile(
      resolve(process.cwd(), "src", "locales", `${targetLanguage}.json`),
      "utf8",
    )
      .then((content) => {
        translations.set(targetLanguage, JSON.parse(content) as TTranslations);
      })
      .catch(async (error) => {
        logger.error(`Failed to load ${targetLanguage} translations: ${getErrorMessage(error)}`);
        if (targetLanguage !== defaultLanguage) await load(defaultLanguage);
      })
      .finally(() => loading.delete(targetLanguage));

    loading.set(targetLanguage, promise);
    return promise;
  }

  function setLanguageMessage(language: string): void {
    const targetLanguage = normalizeLocale(language);
    messageLanguage = translations.has(targetLanguage) ? targetLanguage : defaultLanguage;
  }

  function t(
    key: DotPaths<TTranslations>,
    params?: TranslationParams,
    lang?: string | boolean,
  ): string {
    const targetLanguage =
      typeof lang === "string" ? normalizeLocale(lang) : messageLanguage;
    const translationsForLanguage =
      translations.get(targetLanguage) ?? translations.get(defaultLanguage);
    const value =
      translationsForLanguage && getNestedTranslation(translationsForLanguage, String(key));

    if (typeof value !== "string") return String(key);
    return params
      ? value.replace(/{(\w+)}/g, (_, name: string) => params[name]?.toString() ?? `{${name}}`)
      : value;
  }

  return { load, setLanguageMessage, t };
}
