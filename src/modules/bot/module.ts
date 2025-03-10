import { importx } from "@discordx/importer";
import dotenv from "dotenv";
import { dirname } from "dirname-filename-esm";

import { Module } from '../../core/Module.js';
// import type { BotExports } from './types/index.js';
import { bot } from './bot.js';
import { 
	createLogger, 
	createLocale 
} from "../../utils/index.js";
import translations from './locales/en.json' assert { type: "json" };

const __dirname = dirname(import.meta);
dotenv.config();

export default class BotModule extends Module {   
    public readonly name = 'bot';
    public readonly description = 'RAGU2 module';
    public readonly version = '1.2.0';
    public readonly dependencies = [];
    public readonly exports = {};
    public readonly disabled = false;
    public readonly logger = createLogger(this.name);
    public readonly locale = createLocale<typeof translations>(this.name);

    constructor() {
        super();
    }

    public async start(): Promise<void> {
        await this.locale.load();
        await this.locale.setLanguage(`${process.env.BOT_LOCALE}`);
        
        await importx(`${__dirname}/{events,commands}/**/*.{ts,js}`);
        
        if (!process.env.DISCORD_TOKEN) {
            this.logger.error('Bot token not found');
            throw Error(this.locale.t('messages.bot.token.error'));
        }
        
        await bot.start(process.env.DISCORD_TOKEN);
        this.logger.info('Bot started successfully');
    }

    public async stop(): Promise<void> {
        bot.destroy();
        this.logger.info('Bot stopped');
    }
}

/**
 * The main module instance
 */
export const module = new BotModule();