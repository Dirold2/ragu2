import fs from "fs/promises";
import path from "path";
import { PathResolver } from "./pathResolver.js";
import { bot } from "../bot.js";

interface CachedTranslation {
	data: any;
	loadedAt: number;
	lastAccessed: number;
}

/**
 * Global translation cache to prevent multiple file loads
 */
class TranslationCache {
	private cache = new Map<string, CachedTranslation>();
	private readonly MAX_CACHE_SIZE = 50;
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	private getCacheKey(moduleName: string, language: string): string {
		return `${moduleName}:${language}`;
	}

	async get(moduleName: string, language: string): Promise<any | null> {
		const key = this.getCacheKey(moduleName, language);
		const cached = this.cache.get(key);

		if (cached) {
			// Check if cache is still valid
			const now = Date.now();
			if (now - cached.loadedAt < this.CACHE_TTL) {
				cached.lastAccessed = now;
				return cached.data;
			} else {
				// Cache expired, remove it
				this.cache.delete(key);
			}
		}

		return null;
	}

	async set(moduleName: string, language: string, data: any): Promise<void> {
		const key = this.getCacheKey(moduleName, language);
		const now = Date.now();

		// Clean up old entries if cache is getting too large
		if (this.cache.size >= this.MAX_CACHE_SIZE) {
			this.cleanup();
		}

		this.cache.set(key, {
			data,
			loadedAt: now,
			lastAccessed: now,
		});
	}

	private cleanup(): void {
		// Remove least recently accessed entries
		const entries = Array.from(this.cache.entries());
		entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

		// Remove oldest 25% of entries
		const toRemove = Math.floor(entries.length * 0.25);
		for (let i = 0; i < toRemove; i++) {
			this.cache.delete(entries[i][0]);
		}
	}

	clear(): void {
		this.cache.clear();
	}

	getStats(): { size: number; keys: string[] } {
		return {
			size: this.cache.size,
			keys: Array.from(this.cache.keys()),
		};
	}
}

// Global cache instance
const translationCache = new TranslationCache();

/**
 * Load translation file with caching
 */
export async function loadTranslation(
	moduleName: string,
	language: string,
): Promise<any | null> {
	// Try cache first
	const cached = await translationCache.get(moduleName, language);
	if (cached) {
		return cached;
	}

	// Load from file
	try {
		const localesPath = await findLocalesPath(moduleName);
		if (!localesPath) {
			return null;
		}

		const filePath = path.join(localesPath, `${language}.json`);
		const content = await fs.readFile(filePath, "utf-8");
		const data = JSON.parse(content);

		// Cache the result
		await translationCache.set(moduleName, language, data);

		// Only log on first load, not from cache
		bot.logger.debug(`Loaded translations for ${moduleName}:${language}`);

		return data;
	} catch (error) {
		// logger.warn(`Failed to load ${language} translations for ${moduleName}`);
		return null;
	}
}

/**
 * Find locales path for a module
 */
async function findLocalesPath(moduleName: string): Promise<string | null> {
	// Try main locales directory first
	const mainLocalesPath = PathResolver.getLocalesPath();
	if (PathResolver.pathExists(mainLocalesPath)) {
		return mainLocalesPath;
	}

	// Try module-specific locales
	const moduleLocalesPath = PathResolver.getSrcRelativePath(
		"modules",
		moduleName,
		"locales",
	);
	if (PathResolver.pathExists(moduleLocalesPath)) {
		return moduleLocalesPath;
	}

	// Try alternative paths
	const alternativePaths = [
		PathResolver.getProjectPath("locales"),
		PathResolver.getProjectPath("src", "locales"),
		PathResolver.getSrcRelativePath("locales"),
	];

	for (const altPath of alternativePaths) {
		if (PathResolver.pathExists(altPath)) {
			return altPath;
		}
	}

	return null;
}

export { translationCache };
