import NodeCache from 'node-cache';
import { MusicServicePlugin } from '../interfaces/index.js';
import logger from '../utils/logger.js';
import { MESSAGES } from '../messages.js';

export default class PluginManager {
  private plugins: Map<string, MusicServicePlugin> = new Map();
  private urlCache: NodeCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

  /**
   * Registers a new plugin.
   * @param plugin - The plugin to register.
   */
  registerPlugin(plugin: MusicServicePlugin): void {
    try {
      this.plugins.set(plugin.name, plugin);
      logger.info(`Plugin registered: ${plugin.name}`);
    } catch (error) {
      logger.error(`Failed to register plugin: ${plugin.name}`, error);
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
        logger.debug(MESSAGES.CACHE_HIT(url));
        return this.plugins.get(cachedPluginName);
      }

      const plugin = this.getAllPlugins().find(plugin =>
        plugin.urlPatterns.some(pattern => pattern.test(url))
      );

      if (plugin) {
        this.urlCache.set(url, plugin.name);
        logger.debug(MESSAGES.PLUGIN_FOUND_FOR_URL(url, plugin.name));
      } else {
        logger.debug(MESSAGES.NO_PLUGIN_FOUND_FOR_URL(url));
      }

      return plugin;
    } catch (error) {
      logger.error(`Error finding plugin for URL: ${url}`, error);
      return undefined;
    }
  }
}