import NodeCache from "node-cache";
import { MusicServicePlugin } from "../interfaces/index.js";
import { bot } from "../bot.js";
import { ModuleState } from "../../../types/index.js";

export default class PluginManager {
	private plugins: Map<string, MusicServicePlugin> = new Map();
	private urlCache: NodeCache = new NodeCache({
		stdTTL: 3600,
		checkperiod: 600,
	});

	private readonly logger = bot.logger;
	private readonly locale = bot.locale;

	/**
	 * Registers a new plugin.
	 * @param plugin - The plugin to register.
	 */
	registerPlugin(plugin: MusicServicePlugin): void {
		try {
			this.plugins.set(plugin.name, plugin);
			this.logger.info({
				message: this.locale.t("logger.plugin.registered", {
					name: plugin.name,
				}),
				moduleState: ModuleState.INITIALIZED,
			});
		} catch (error) {
			this.logger.error(
				`${this.locale.t("logger.plugin.register_error")}:`,
				error,
			);
		}
	}

	/**
	 * Retrieves a plugin by its name.
	 * @param name - The name of the plugin.
	 * @returns The plugin if found, otherwise undefined.
	 */
	getPlugin(name: string): MusicServicePlugin | undefined {
		return this.plugins.get(name);
	}

	/**
	 * Retrieves all registered plugins.
	 * @returns An array of all plugins.
	 */
	getAllPlugins(): MusicServicePlugin[] {
		return Array.from(this.plugins.values());
	}

	/**
	 * Finds a plugin that matches a given URL.
	 * @param url - The URL to match against plugin patterns.
	 * @returns The matching plugin if found, otherwise undefined.
	 */
	getPluginForUrl(url: string): MusicServicePlugin | undefined {
		try {
			const cachedPluginName = this.urlCache.get<string>(url);
			if (cachedPluginName) {
				this.logger.debug(
					`${this.locale.t("logger.plugin.cache.hit")}:`,
					cachedPluginName,
				);
				return this.plugins.get(cachedPluginName);
			}

			const plugin = this.getAllPlugins().find((plugin) =>
				plugin.urlPatterns.some((pattern) => pattern.test(url)),
			);

			if (plugin) {
				this.urlCache.set(url, plugin.name);
				this.logger.debug(`${this.locale.t("logger.plugin.not_found")}`);
			} else {
				this.logger.debug(`${this.locale.t("logger.plugin.not_found")}`);
			}

			return plugin;
		} catch (error) {
			this.logger.error(`${this.locale.t("logger.plugin.not_found")}:`, error);
			return undefined;
		}
	}
}
