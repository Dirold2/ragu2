import { HttpsProxyAgent } from 'https-proxy-agent';
import logger from '../utils/logger.js';

export default class ProxyService {
    private proxyAgent: HttpsProxyAgent<string> | null = null;
    private proxyEnabled: boolean = false;

    constructor() {
        this.initializeProxy();
    }

    private initializeProxy(): void {
        const proxyUrl = process.env.PROXY_URL;
        if (proxyUrl) {
            try {
                this.proxyAgent = new HttpsProxyAgent(proxyUrl);
                this.proxyEnabled = true;
                logger.info('Прокси успешно инициализирован');
            } catch (error) {
                logger.error('Ошибка инициализации прокси:', error);
            }
        }
    }

    public getProxyAgent(): HttpsProxyAgent<string> | null {
        return this.proxyEnabled ? this.proxyAgent : null;
    }

    public isProxyEnabled(): boolean {
        return this.proxyEnabled;
    }
} 