import { importx } from "@discordx/importer";
import { Module } from '../../core/Module.js';
import { bot } from './bot.js';
import type { ModuleMetadata } from '../../types/index.js';
import { dirname } from "dirname-filename-esm";

const __dirname = dirname(import.meta);

export default class BotModule extends Module {
    public readonly metadata: ModuleMetadata = {
        name: 'bot',
        description: 'RAGU2 Discord bot module',
        version: '1.2.0',
        dependencies: [],
        disabled: false,
        priority: 100
    };

    public readonly exports = {
        getBot: () => bot
    } as const;

    protected async onInitialize(): Promise<void> {
        await this.locale.load();
        await this.locale.setLanguage(process.env.BOT_LOCALE || 'en');
        bot.initEvents();
    }

    protected async onStart(): Promise<void> {
        await this.loadCommands();
        await this.startBot();
    }

    protected async onStop(): Promise<void> {
        await this.stopBot();
    }

    private async loadCommands(): Promise<void> {
        await importx(`${__dirname}/{events,commands}/**/*.{ts,js}`);
    }

    private async startBot(): Promise<void> {
        if (!process.env.DISCORD_TOKEN) {
            throw new Error(this.locale.t('messages.bot.token.error'));
        }
        
        await bot.start(process.env.DISCORD_TOKEN);
        this.logger.info('Bot started successfully');
    }

    private async stopBot(): Promise<void> {
        bot.destroy();
        this.logger.info('Bot stopped');
    }
}

export const module = new BotModule();