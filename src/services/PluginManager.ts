import type { MusicServicePlugin } from "../interfaces/index.js";
import { bot } from "../bot.js";

export default class PluginManager {
	private readonly plugins = new Map<string, MusicServicePlugin>();
	private readonly disabledPlugins = new Set<string>();
	private readonly urlCache = new Map<string, string>();

	private readonly logger = bot.logger;
	private readonly locale = bot.locale;

	private readonly MAX_URL_CACHE_SIZE = 1000;
	private readonly CACHE_CLEANUP_INTERVAL = 60 * 60 * 1000;
	private readonly CACHE_TRIM_RATIO = 0.1;

	private cacheCleanupInterval: NodeJS.Timeout | null = null;

	constructor() {
		this.cacheCleanupInterval = setInterval(
			() => this.pruneUrlCache(),
			this.CACHE_CLEANUP_INTERVAL,
		);
	}

	registerPlugin(plugin: MusicServicePlugin | null | undefined): boolean {
		try {
			if (!plugin) {
				this.logger?.error?.(
					"PluginManager.registerPlugin: plugin is null/undefined",
				);
				return false;
			}

			const rawName = plugin.name;
			const name = typeof rawName === "string" ? rawName.trim() : "";

			if (!name) {
				this.logger?.error?.(
					"PluginManager.registerPlugin: Plugin name is required",
				);
				return false;
			}

			if (this.plugins.has(name)) {
				this.logger?.warn?.(`Plugin "${name}" is already registered`);
				return false;
			}

			plugin.name = name;
			this.plugins.set(name, plugin);

			if (plugin.disabled) {
				this.disabledPlugins.add(name);
				this.logger?.debug?.(
					`Plugin "${name}" registered as disabled (initial state)`,
				);
			} else {
				this.disabledPlugins.delete(name);
				this.logger?.debug?.(`Plugin "${name}" registered and enabled`);
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

	enablePlugin(name: string): boolean {
		const normalized = name?.trim();
		if (!normalized) {
			this.logger?.warn?.("PluginManager.enablePlugin: empty plugin name");
			return false;
		}

		if (!this.plugins.has(normalized)) {
			this.logger?.warn?.(`Cannot enable unknown plugin "${normalized}"`);
			return false;
		}

		if (!this.disabledPlugins.has(normalized)) {
			this.logger?.debug?.(`Plugin "${normalized}" is already enabled`);
			return true;
		}

		this.disabledPlugins.delete(normalized);
		const plugin = this.plugins.get(normalized);
		if (plugin) plugin.disabled = false;
		this.logger?.info?.(`Plugin "${normalized}" enabled`);
		return true;
	}

	disablePlugin(name: string): boolean {
		const normalized = name?.trim();
		if (!normalized) {
			this.logger?.warn?.("PluginManager.disablePlugin: empty plugin name");
			return false;
		}

		if (!this.plugins.has(normalized)) {
			this.logger?.warn?.(`Cannot disable unknown plugin "${normalized}"`);
			return false;
		}

		if (this.disabledPlugins.has(normalized)) {
			this.logger?.debug?.(`Plugin "${normalized}" is already disabled`);
			return true;
		}

		this.disabledPlugins.add(normalized);
		const plugin = this.plugins.get(normalized);
		if (plugin) plugin.disabled = true;
		this.logger?.info?.(`Plugin "${normalized}" disabled`);
		return true;
	}

	isPluginEnabled(name: string): boolean {
		const normalized = name?.trim();
		if (!normalized) return false;
		if (!this.plugins.has(normalized)) return false;
		return !this.disabledPlugins.has(normalized);
	}

	getPlugin(name: string): MusicServicePlugin | undefined {
		const normalized = name?.trim();
		if (!normalized) return undefined;
		return this.plugins.get(normalized);
	}

	getAllPlugins(): readonly MusicServicePlugin[] {
		return Array.from(this.plugins.values());
	}

	getActivePlugins(): readonly MusicServicePlugin[] {
		return this.getAllPlugins().filter((p) => this.isPluginEnabled(p.name));
	}

	getPluginForUrl(url: string): MusicServicePlugin | undefined {
		try {
			if (typeof url !== "string") throw new Error("URL must be a string");

			const trimmedUrl = url.trim();
			if (!trimmedUrl) {
				this.logger?.debug?.("PluginManager.getPluginForUrl: empty URL");
				return undefined;
			}

			const cachedPluginName = this.urlCache.get(trimmedUrl);
			if (cachedPluginName) {
				if (!this.isPluginEnabled(cachedPluginName)) {
					this.urlCache.delete(trimmedUrl);
				} else {
					const cachedPlugin = this.plugins.get(cachedPluginName);
					if (cachedPlugin) {
						this.logger?.debug?.(
							this.locale.t("messages.playerManager.cache.hit", {
								key: cachedPlugin.name,
							}),
						);
						this.logger?.debug?.("PluginManager.getPluginForUrl: cache hit", {
							url: trimmedUrl,
							plugin: cachedPlugin.name,
						});
						return cachedPlugin;
					}
				}
			}

			const plugin = this.getActivePlugins().find((p) =>
				p.urlPatterns?.some((pattern) => pattern.test(trimmedUrl)),
			);

			if (plugin) {
				this.addToUrlCache(trimmedUrl, plugin.name);
				this.logger?.debug?.("Plugin found for URL", {
					url: trimmedUrl,
					plugin: plugin.name,
				});
				return plugin;
			}

			this.logger?.debug?.(
				this.locale.t("messages.playerManager.errors.plugin.not_found"),
				{ url: trimmedUrl },
			);

			return undefined;
		} catch (error) {
			this.handleError(
				"getPluginForUrl",
				error,
				`Error finding plugin for URL: ${url}`,
			);
			return undefined;
		}
	}

	clearCache(): void {
		const cacheSize = this.urlCache.size;
		this.urlCache.clear();
		this.logger?.debug?.("URL cache cleared", { previousSize: cacheSize });
	}

	destroy(): void {
		if (this.cacheCleanupInterval) {
			clearInterval(this.cacheCleanupInterval);
			this.cacheCleanupInterval = null;
		}
		this.plugins.clear();
		this.disabledPlugins.clear();
		this.urlCache.clear();
		this.logger?.debug?.("PluginManager.destroy: resources cleared");
	}

	private addToUrlCache(url: string, pluginName: string): void {
		if (this.urlCache.size >= this.MAX_URL_CACHE_SIZE) {
			this.trimUrlCache();
		}
		this.urlCache.set(url, pluginName);
	}

	private trimUrlCache(): void {
		const targetRemove = Math.max(
			1,
			Math.floor(this.MAX_URL_CACHE_SIZE * this.CACHE_TRIM_RATIO),
		);
		const keys = Array.from(this.urlCache.keys());
		for (let i = 0; i < targetRemove && i < keys.length; i += 1) {
			this.urlCache.delete(keys[i]);
		}
		this.logger?.debug?.("URL cache trimmed", {
			removed: targetRemove,
			newSize: this.urlCache.size,
		});
	}

	private handleError(context: string, error: unknown, message?: string): void {
		const errorMessage = message || `Error in ${context}`;
		const errorObj = error instanceof Error ? error : new Error(String(error));
		this.logger?.error?.(errorMessage, {
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
