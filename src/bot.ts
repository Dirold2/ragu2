import { dirname } from 'dirname-filename-esm';
import { IntentsBitField, Interaction, Message } from 'discord.js';
import { Client } from 'discordx';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import {
    CommandService, NameService, PlayerManager, PluginManager, QueueService, ProxyService
} from './services/index.js';
import logger from './utils/logger.js';
import { startServer } from './server.js';

const __dirname = dirname(import.meta);

class Bot {
    public client: Client;
    public nameService!: NameService;
    public queueService!: QueueService;
    public playerManager!: PlayerManager;
    public commandService!: CommandService;
    public proxyService!: ProxyService;

    constructor() {
        this.client = new Client({
            intents: [
                IntentsBitField.Flags.Guilds,
                IntentsBitField.Flags.GuildMembers,
                IntentsBitField.Flags.GuildMessages,
                IntentsBitField.Flags.GuildMessageReactions,
                IntentsBitField.Flags.GuildVoiceStates,
                IntentsBitField.Flags.MessageContent,
            ],
            silent: false,
            simpleCommand: {
                prefix: "!",
            },
        });

        this.initializeServices();
        this.setupEventListeners();
    }

    private initializeServices(): void {
        this.proxyService = new ProxyService();
        this.commandService = new CommandService();
        this.queueService = new QueueService();
        this.playerManager = new PlayerManager(this.queueService, this.commandService);
        const pluginManager = new PluginManager();
        this.registerPlugins(pluginManager);
        this.nameService = new NameService(this.queueService, this.playerManager, pluginManager);
    }

    private registerPlugins(pluginManager: PluginManager): void {
        const pluginsDir = path.resolve(__dirname, 'plugins');
        fs.readdirSync(pluginsDir).forEach(async (file) => {
            if (file.endsWith('.ts') || file.endsWith('.js')) {
                const pluginPath = String(pathToFileURL(path.join(pluginsDir, file)));
                const { default: Plugin } = await import(pluginPath);
                const pluginInstance = new Plugin();
                pluginManager.registerPlugin(pluginInstance);
                logger.info(`Registered plugin: ${file}`);
            }
        });
    }

    private setupEventListeners(): void {
        this.client.once("ready", async () => {
            void this.client.initApplicationCommands();
            logger.info("Bot initialized");

            // Запускаем Fastify сервер после инициализации бота
            try {
                await startServer();
                logger.info("API server started successfully");
            } catch (error) {
                logger.error("Failed to start API server:", error);
            }
        });

        this.client.on("interactionCreate", (interaction: Interaction) => {
            this.client.executeInteraction(interaction);
        });

        this.client.on("messageCreate", (message: Message) => {
            void this.client.executeCommand(message);
        });
    }

    public async start(token: string): Promise<void> {
        try {
            await this.client.login(token);
            logger.info("Bot started");
        } catch (error) {
            logger.error("Failed to start the bot:", error);
        }
    }

    public removeEvents(): void {
        this.client.removeAllListeners();
    }

    public initEvents(): void {
        this.setupEventListeners();
    }
}

export const bot = new Bot();