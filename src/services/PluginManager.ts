import NodeCache from 'node-cache';
import { MusicServicePlugin } from '../interfaces/index.js';

export default class PluginManager {
    private plugins: Map<string, MusicServicePlugin> = new Map();
    private urlCache: NodeCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

    registerPlugin(plugin: MusicServicePlugin): void {
        this.plugins.set(plugin.name, plugin);
    }

    getPlugin(name: string): MusicServicePlugin | undefined {
        return this.plugins.get(name);
    }

    getAllPlugins(): MusicServicePlugin[] {
        return Array.from(this.plugins.values());
    }

    getPluginForUrl(url: string): MusicServicePlugin | undefined {
        const cachedPlugin = this.urlCache.get<string>(url);
        if (cachedPlugin) {
          return this.plugins.get(cachedPlugin);
        }
    
        const plugin = this.getAllPlugins().find(plugin => 
          plugin.urlPatterns.some(pattern => pattern.test(url))
        );
    
        if (plugin) {
          this.urlCache.set(url, plugin.name);
        }
    
        return plugin;
      }
}