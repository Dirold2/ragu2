import { HttpsProxyAgent } from "https-proxy-agent";
import { bot } from "../bot.js";

/**
 * Сервис для управления прокси-соединениями
 */
export default class ProxyService {
	private proxyAgent: HttpsProxyAgent<string> | null = null;
	private proxyEnabled = false;
	private readonly logger = bot.logger;

	// Добавляем кэш для прокси-соединений
	private proxyCache = new Map<string, HttpsProxyAgent<string>>();

	constructor() {
		this.initializeProxy();
	}

	/**
	 * Инициализирует прокси из переменных окружения
	 */
	private initializeProxy(): void {
		const proxyUrl = process.env.PROXY_URL;
		if (proxyUrl) {
			try {
				this.proxyAgent = new HttpsProxyAgent(proxyUrl);
				this.proxyEnabled = true;
				this.logger.info("Proxy initialized successfully");
			} catch (error) {
				this.logger.error(`Error initializing proxy: ${error}`);
			}
		}
	}

	/**
	 * Получает прокси-агент для HTTP-запросов
	 */
	public getProxyAgent(): HttpsProxyAgent<string> | null {
		return this.proxyEnabled ? this.proxyAgent : null;
	}

	/**
	 * Проверяет, включен ли прокси
	 */
	public isProxyEnabled(): boolean {
		return this.proxyEnabled;
	}

	/**
	 * Получает опции прокси для fetch-запросов
	 */
	public getProxyOptions(): { agent: HttpsProxyAgent<string> } | object {
		return this.proxyEnabled && this.proxyAgent
			? { agent: this.proxyAgent }
			: {};
	}

	/**
	 * Получает прокси-агент для конкретного URL
	 * Использует кэширование для повышения производительности
	 */
	public getProxyAgentForUrl(url: string): HttpsProxyAgent<string> | null {
		if (!this.proxyEnabled) return null;

		// Извлекаем домен из URL
		let domain;
		try {
			domain = new URL(url).hostname;
		} catch (e) {
			this.logger.error(`Invalid URL: ${url}`, e);
			return this.proxyAgent;
		}

		// Проверяем кэш
		if (this.proxyCache.has(domain)) {
			return this.proxyCache.get(domain) || null;
		}

		// Используем основной прокси
		this.proxyCache.set(domain, this.proxyAgent!);
		return this.proxyAgent;
	}

	/**
	 * Очищает кэш прокси
	 */
	public clearProxyCache(): void {
		this.proxyCache.clear();
	}
}
