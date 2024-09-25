import { MusicServicePlugin } from '../interfaces/index.js';

export default class PluginManager {
    private plugins: Map<string, MusicServicePlugin> = new Map();

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
        return this.getAllPlugins().find(plugin => 
            plugin.urlPatterns.some(pattern => pattern.test(url))
        );
    }
}