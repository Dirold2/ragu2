import type { MusicServicePlugin } from "../interfaces/index.js";
import { bot } from "../bot.js";

/**
 * Manages music service plugins with improved caching and performance,
 * with ability to enable/disable plugins at runtime.
 */
export default class PluginManager {
	private readonly plugins: Map<string, MusicServicePlugin> = new Map();
	private readonly disabledPlugins: Set<string> = new Set();
	private readonly urlCache: Map<string, string> = new Map();
	private readonly logger = bot.logger;
	private readonly locale = bot.locale;
	private readonly MAX_URL_CACHE_SIZE = 1000;
	private readonly CACHE_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

	constructor() {
		setInterval(() => this.pruneUrlCache(), this.CACHE_CLEANUP_INTERVAL);
	}

	/**
	 * Registers a new plugin with proper validation and error handling.
	 * Honors plugin.disabled if set.
	 */
	registerPlugin(plugin: MusicServicePlugin): boolean {
		try {
			if (!plugin?.name) {
				this.logger.error("Plugin name is required");
				return false;
			}

			if (this.plugins.has(plugin.name)) {
				this.logger.warn(`Plugin "${plugin.name}" is already registered`);
				return false;
			}

			this.plugins.set(plugin.name, plugin);
			if (plugin.disabled) {
				this.disabledPlugins.add(plugin.name);
				this.logger.debug(
					`Plugin "${plugin.name}" registered as disabled (initial state)`,
				);
			} else {
				this.disabledPlugins.delete(plugin.name);
				this.logger.debug(`Plugin "${plugin.name}" registered and enabled`);
			}

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
	 * Enables a previously disabled plugin.
	 */
	enablePlugin(name: string): boolean {
		if (!this.plugins.has(name)) {
			this.logger.warn(`Cannot enable unknown plugin "${name}"`);
			return false;
		}
		if (!this.disabledPlugins.has(name)) {
			this.logger.debug(`Plugin "${name}" is already enabled`);
			return true;
		}
		this.disabledPlugins.delete(name);
		// синхронизируем флаг в объекте, если он есть
		const p = this.plugins.get(name);
		if (p) p.disabled = false;
		this.logger.info(`Plugin "${name}" enabled`);
		return true;
	}

	/**
	 * Disables a plugin so it won't be used in matching, without unregistering.
	 */
	disablePlugin(name: string): boolean {
		if (!this.plugins.has(name)) {
			this.logger.warn(`Cannot disable unknown plugin "${name}"`);
			return false;
		}
		if (this.disabledPlugins.has(name)) {
			this.logger.debug(`Plugin "${name}" is already disabled`);
			return true;
		}
		this.disabledPlugins.add(name);
		const p = this.plugins.get(name);
		if (p) p.disabled = true;
		this.logger.info(`Plugin "${name}" disabled`);
		return true;
	}

	/**
	 * Returns whether a plugin is enabled.
	 */
	isPluginEnabled(name: string): boolean {
		if (!this.plugins.has(name)) return false;
		return !this.disabledPlugins.has(name);
	}

	/**
	 * Gets plugin by name regardless of enabled state.
	 */
	getPlugin(name: string): MusicServicePlugin | undefined {
		return this.plugins.get(name);
	}

	/**
	 * Returns all registered plugins (including disabled ones).
	 */
	getAllPlugins(): readonly MusicServicePlugin[] {
		return Array.from(this.plugins.values());
	}

	/**
	 * Returns only enabled/active plugins.
	 */
	getActivePlugins(): readonly MusicServicePlugin[] {
		return this.getAllPlugins().filter((p) => this.isPluginEnabled(p.name));
	}

	/**
	 * Finds a plugin that matches the URL with cache optimization, only among enabled plugins.
	 */
	getPluginForUrl(url: string): MusicServicePlugin | undefined {
		try {
			if (typeof url !== "string") {
				throw new Error("URL must be a string");
			}

			// Check cache first
			const cachedPluginName = this.urlCache.get(url);
			if (cachedPluginName) {
				if (!this.isPluginEnabled(cachedPluginName)) {
					// кеш содержит отключённый плагин — сбросим его
					this.urlCache.delete(url);
				} else {
					const plugin = this.plugins.get(cachedPluginName);
					if (plugin) {
						this.logger.debug(
							this.locale.t("messages.playerManager.cache.hit", {
								key: plugin.name,
							}),
							{
								plugin: plugin.name,
							},
						);
						return plugin;
					}
				}
			}

			// Find matching plugin among enabled ones
			const plugin = this.getActivePlugins().find((p) =>
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

		this.logger.error(errorMessage, {
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
