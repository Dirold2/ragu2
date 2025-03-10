import { Module } from '../../core/Module.js';
// import type { BotExports } from './types/index.js';
import { ApiServer } from './server.js';
import { Api } from './api.js';
import { 
	createLogger, 
	createLocale 
} from "../../utils/index.js";
import translations from './locales/en.json' assert { type: "json" };

import dotenv from "dotenv";
dotenv.config();

export default class ApiModule extends Module {
    private apiServer: ApiServer | null = null;
    private api: Api | null = null;
    
    public readonly name = 'api';
    public readonly description = 'HTTP API module';
    public readonly version = '1.0.0';
    public readonly dependencies = [];
    public readonly exports = {};
    public readonly disabled = false;
    public readonly logger = createLogger(this.name);
    public readonly locale = createLocale<typeof translations>(this.name);

    constructor() {
        super();
    }

    public async start(): Promise<void> {
        if (this.disabled) {
            return;
        }

        await this.locale.load();
        await this.locale.setLanguage(`${process.env.BOT_LOCALE}`);

        // const botExports = this.getModuleExports<BotExports>('bot');
        
        // Создаем сервер (без запуска)
        this.apiServer = new ApiServer();
        const server = await this.apiServer.create();

        // Создаем API и регистрируем маршруты
        this.api = new Api(server, this.locale);
        this.api.setupRoutes();

        // Запускаем сервер после настройки всех маршрутов
        await this.apiServer.start();
        const startPort = Number(process.env.API_PORT) || 1750
        this.logger.info(this.locale.t('logger.server.started', { port: `${startPort}` }));
    }

    public async stop(): Promise<void> {
        if (this.apiServer) {
            await this.apiServer.stop();
            this.apiServer = null;
            this.api = null;
            this.logger.info(this.locale.t('logger.server.stopped'));
        }
    }
}

/**
 * The main module instance
 */
export const module = new ApiModule();