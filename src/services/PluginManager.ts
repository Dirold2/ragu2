import type { MusicServicePlugin } from "../interfaces/index.js";
import { bot } from "../bot.js";

/**
 * Manages music service plugins with improved caching and performance
 */
export default class PluginManager {
	private readonly plugins: Map<string, MusicServicePlugin> = new Map();
	private readonly urlCache: Map<string, string> = new Map();
	private readonly logger = bot.logger;
	private readonly locale = bot.locale;
	private readonly MAX_URL_CACHE_SIZE = 1000;
	private readonly CACHE_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

	constructor() {
		setInterval(() => this.pruneUrlCache(), this.CACHE_CLEANUP_INTERVAL);
	}

	/**
	 * Registers a new plugin with proper validation and error handling
	 */
	registerPlugin(plugin: MusicServicePlugin): boolean {
		try {
			if (!plugin?.name) {
				this.logger.error("Plugin name is required");
			}

			if (this.plugins.has(plugin.name)) {
				this.logger.warn(`Plugin "${plugin.name}" is already registered`);
				return false;
			}

			this.plugins.set(plugin.name, plugin);

			return true;
		} catch (error) {
			this.handleError(
				"registerPlugin",
				error,
				`Failed to register plugin: ${plugin?.name || "unknown"}`,
			);
			return false;
		}
	}

	/**
	 * Gets plugin by name with type safety
	 */
	getPlugin(name: string): MusicServicePlugin | undefined {
		return this.plugins.get(name);
	}

	/**
	 * Returns all registered plugins as an array
	 */
	getAllPlugins(): readonly MusicServicePlugin[] {
		return Array.from(this.plugins.values());
	}

	/**
	 * Finds a plugin that matches the URL with cache optimization
	 */
	getPluginForUrl(url: string): MusicServicePlugin | undefined {
		try {
			if (typeof url !== "string") {
				throw new Error("URL must be a string");
			}

			// Check cache first
			const cachedPluginName = this.urlCache.get(url);
			if (cachedPluginName) {
				const plugin = this.plugins.get(cachedPluginName);
				if (plugin) {
					this.logger.debug(this.locale.t("messages.playerManager.cache.hit"), {
						plugin: plugin.name,
					});
					return plugin;
				}
			}

			// Find matching plugin
			const plugin = this.getAllPlugins().find((p) =>
				p.urlPatterns?.some((pattern) => pattern.test(url)),
			);

			if (plugin) {
				if (this.urlCache.size >= this.MAX_URL_CACHE_SIZE) {
					const keysToDelete = Array.from(this.urlCache.keys()).slice(
						0,
						Math.floor(this.MAX_URL_CACHE_SIZE * 0.1),
					);
					keysToDelete.forEach((key) => this.urlCache.delete(key));
				}
				this.urlCache.set(url, plugin.name);
				this.logger.debug("Plugin found for URL", {
					url,
					plugin: plugin.name,
				});
			} else {
				this.logger.debug(
					this.locale.t("messages.playerManager.errors.plugin.not_found"),
					{ url },
				);
			}

			return plugin;
		} catch (error) {
			this.handleError(
				"getPluginForUrl",
				error,
				`Error finding plugin for URL: ${url}`,
			);
			return undefined;
		}
	}

	/**
	 * Clears the URL cache
	 */
	clearCache(): void {
		const cacheSize = this.urlCache.size;
		this.urlCache.clear();
		this.logger.debug("URL cache cleared", { previousSize: cacheSize });
	}

	/**
	 * Unified error handling
	 */
	private handleError(context: string, error: unknown, message?: string): void {
		const errorMessage = message || `Error in ${context}`;
		const errorObj = error instanceof Error ? error : new Error(String(error));

		console.error(errorMessage, {
			error: errorObj.message,
			stack: errorObj.stack,
			context,
		});
	}

	private pruneUrlCache(): void {
		if (this.urlCache.size > this.MAX_URL_CACHE_SIZE / 2) {
			this.clearCache();
		}
	}
}
