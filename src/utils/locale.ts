import fs from 'fs/promises';
import path from 'path';
import { dirname } from 'dirname-filename-esm';

const __dirname = dirname(import.meta);

/**
 * Type for translation parameters
 */
type TranslationParams = {
    [key: string]: string | number;
}

/**
 * Recursively builds dot notation paths for translation keys
 */
type DotPaths<T> = T extends object
    ? {
        [K in keyof T]: T[K] extends object
            ? `${K & string}` | `${K & string}.${DotPaths<T[K]> & string}`
            : `${K & string}`
    }[keyof T]
    : never;

/**
 * Public localization interface
 */
export interface Locale<T = any> {
    t(key: DotPaths<T>, params?: TranslationParams): string;
}

/**
 * Private localization interface with additional methods
 * Приватный интерфейс локализации
 */
interface LocalePrivate<T = any> extends Locale<T> {
    load(language?: string): Promise<void>;
    setLanguage(language: string): Promise<void>;
}

/**
 * Creates a localization instance for a module
 * @param moduleName - Name of the module to create localization for
 * @returns Localization instance with load, setLanguage and translation methods
 */
export function createLocale<T extends Record<string, any>>(moduleName: string): LocalePrivate<T> {
    // Map to store loaded translations
    const translations = new Map<string, T>();
    let currentLanguage = 'en';

    /**
     * Loads translations for specified language
     * @param language - Language code to load translations for (defaults to 'en')
     */
    async function load(language: string = 'en') {
        try {
            // Try to load requested language
            const filePath = path.join(__dirname, '../../src/modules', moduleName, 'locales', `${language}.json`);
            const content = await fs.readFile(filePath, 'utf-8');
            translations.set(language, JSON.parse(content));
        } catch (error) {
            // If failed to load requested language and it's not English
            if (language !== 'en') {
                try {
                    // Try to load English as fallback
                    const defaultPath = path.join(__dirname, '../../src/modules', moduleName, 'locales/en.json');
                    const defaultContent = await fs.readFile(defaultPath, 'utf-8');
                    translations.set('en', JSON.parse(defaultContent));
                    currentLanguage = 'en';
                } catch (fallbackError) {
                    console.error(`Failed to load both '${language}' and fallback English translations for ${moduleName}`);
                }
            } else {
                console.error(`Failed to load English translations for ${moduleName}`);
            }
        }
    }

    /**
     * Sets the current language for translations
     * @param language - Language code to set as current
     */
    async function setLanguage(language: string) {
        // Load language if not loaded
        if (!translations.has(language)) {
            await load(language);
        }
        
        // Use English as fallback if load failed and language is not English
        if (!translations.has(language) && language !== 'en') {
            if (!translations.has('en')) {
                await load('en');
            }
            currentLanguage = 'en';
        } else {
            currentLanguage = language;
        }
    }

    /**
     * Get translation by key
     * @param key - Translation key in dot notation (e.g. "errors.notFound")
     * @param params - Optional parameters for interpolation
     * @returns Translated string with interpolated parameters
     */
    function t(key: DotPaths<T>, params?: TranslationParams): string {
        const trans = translations.get(currentLanguage) || translations.get('en');
        if (!trans) return key;

        const value = String(key).split('.').reduce<any>((obj: any, k: string) => obj?.[k], trans);
        if (typeof value !== 'string') return key;

        if (!params) return value;
        return value.replace(/{(\w+)}/g, (_, k) => params[k]?.toString() ?? `{${k}}`);
    }

    return {
        load,
        setLanguage,
        t
    };
}