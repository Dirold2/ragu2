import { Hono } from "hono";
import type { MusicServicePlugin } from "../interfaces/index.js";
import { bot } from "../bot.js";

/**
 * Manages music service plugins with improved caching and performance
 */
export default class PluginManager {
	private plugins: Map<string, MusicServicePlugin> = new Map();
	// Используем встроенный в Bun кэш для лучшей производительности
	private urlCache = new Map<string, string>();

	// Создаем Hono API для плагинов (опционально)
	private api = new Hono();

	private readonly logger = bot.logger;
	private readonly locale = bot.locale;

	constructor() {
		// Инициализация API для плагинов
		this.setupPluginApi();
	}

	/**
	 * Настраивает API для взаимодействия с плагинами
	 */
	private setupPluginApi(): void {
		this.api.get("/plugins", (c) => {
			return c.json(Array.from(this.plugins.keys()));
		});

		this.api.get("/plugins/:name", (c) => {
			const name = c.req.param("name");
			const plugin = this.plugins.get(name);
			return plugin
				? c.json(plugin)
				: c.json({ error: "Plugin not found" }, 404);
		});
	}

	/**
	 * Регистрирует новый плагин
	 */
	registerPlugin(plugin: MusicServicePlugin): void {
		try {
			this.plugins.set(plugin.name, plugin);
			this.logger.info({
				message: this.locale.t("logger.plugin.registered", {
					name: plugin.name,
				}),
				moduleState: "INITIALIZED",
			});
		} catch (error) {
			this.logger.error(
				`${this.locale.t("logger.plugin.register_error")}:`,
				error,
			);
		}
	}

	/**
	 * Получает плагин по имени
	 */
	getPlugin(name: string): MusicServicePlugin | undefined {
		return this.plugins.get(name);
	}

	/**
	 * Получает все зарегистрированные плагины
	 */
	getAllPlugins(): MusicServicePlugin[] {
		return Array.from(this.plugins.values());
	}

	/**
	 * Находит плагин, соответствующий URL
	 * Оптимизировано для Bun с использованием встроенного кэша
	 */
	getPluginForUrl(url: string): MusicServicePlugin | undefined {
		try {
			// Используем встроенный Map для кэширования
			const cachedPluginName = this.urlCache.get(url);
			if (cachedPluginName) {
				this.logger.debug(
					`${this.locale.t("logger.plugin.cache.hit")}:`,
					cachedPluginName,
				);
				return this.plugins.get(cachedPluginName);
			}

			// Используем Array.find вместо filter для лучшей производительности
			const plugin = this.getAllPlugins().find((plugin) =>
				plugin.urlPatterns.some((pattern) => pattern.test(url)),
			);

			if (plugin) {
				this.urlCache.set(url, plugin.name);
				this.logger.debug(`Plugin found: ${plugin.name}`);
			} else {
				this.logger.debug(`${this.locale.t("logger.plugin.not_found")}`);
			}

			return plugin;
		} catch (error) {
			this.logger.error(`${this.locale.t("logger.plugin.not_found")}:`, error);
			return undefined;
		}
	}

	/**
	 * Очищает кэш URL
	 */
	clearCache(): void {
		this.urlCache.clear();
		this.logger.debug("URL cache cleared");
	}
}
