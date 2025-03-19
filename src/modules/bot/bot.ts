import {
	ClientEvents,
	IntentsBitField,
	Interaction,
	Message,
} from "discord.js";
import { Client } from "discordx";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { PrismaClient } from "@prisma/client";

import {
	CommandService,
	NameService,
	PlayerManager,
	PluginManager,
	QueueService,
	ProxyService,
} from "./services/index.js";

import { createLogger, createLocale } from "../../utils/index.js";
import translations from "./locales/en.json" with { type: "json" };

import { config } from "dotenv";
import { dirname } from "dirname-filename-esm";
import { resolve } from "path";

const __dirname = dirname(import.meta);

config({ path: resolve(__dirname, ".env") });

const LOG_MESSAGES = {
	PLUGIN_REGISTRATION_ERROR: (name: string) => ({
		key: "logger.pluginRegisterError",
		params: { name },
	}),
	INIT_ERROR: { key: "messages.bot.initializationFailed" },
	READY: { key: "messages.bot.initialized" },
	LOGIN_ERROR: { key: "messages.bot.startError" },
} as const;

export class Bot {
	public readonly client: Client;
	public nameService!: NameService;
	public queueService!: QueueService;
	public playerManager!: PlayerManager;
	public commandService!: CommandService;
	public proxyService!: ProxyService;
	public pluginManager!: PluginManager;
	public readonly logger = createLogger("bot");
	public readonly locale = createLocale<typeof translations>("bot");
	public prisma!: PrismaClient;
	private eventHandlers: Map<string, Function> = new Map();

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
			silent: true,
			simpleCommand: { prefix: "!" },
		});
	}

	public async initialize(): Promise<void> {
		try {
			await this.init();
		} catch (error) {
			this.log("error", LOG_MESSAGES.INIT_ERROR);
			throw error;
		}
	}

	private async init(): Promise<void> {
		await this.initServices();
		this.setupEvents();
	}

	private async initServices(): Promise<void> {
		try {
			await this.locale.load();
			await this.locale.setLanguage(`${process.env.BOT_LOCALE}` || "en");

			this.commandService = new CommandService();
			this.pluginManager = new PluginManager();
			await this.loadPlugins();

			this.queueService = new QueueService();
			this.playerManager = new PlayerManager(
				this.queueService,
				this.commandService,
			);
			this.nameService = new NameService(
				this.queueService,
				this.playerManager,
				this.pluginManager,
			);
		} catch (error) {
			this.log("error", LOG_MESSAGES.INIT_ERROR);
			throw error;
		}
	}

	private async loadPlugins(): Promise<void> {
		const pluginsDir = path.resolve(__dirname, "plugins");

		try {
			const files = await fs.promises.readdir(pluginsDir);
			await Promise.all(
				files
					.filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
					.map(async (file) => {
						try {
							const { default: Plugin } = await import(
								String(pathToFileURL(path.join(pluginsDir, file)))
							);
							const plugin = new Plugin();
							this.pluginManager.registerPlugin(plugin);
						} catch (error) {
							this.log("error", LOG_MESSAGES.PLUGIN_REGISTRATION_ERROR(file));
						}
					}),
			);
		} catch (error) {
			this.log("error", LOG_MESSAGES.PLUGIN_REGISTRATION_ERROR("unknown"));
			throw error;
		}
	}

	private setupEvents(): void {
		// Сохраняем ссылки на обработчики
		const readyHandler = async () => {
			try {
				await this.client.initApplicationCommands();
			} catch {
				this.log("error", LOG_MESSAGES.INIT_ERROR);
			}
		};

		const interactionHandler = (interaction: Interaction) => {
			this.client.executeInteraction(interaction);
		};

		const messageHandler = (message: Message) => {
			void this.client.executeCommand(message);
		};

		this.eventHandlers.set("ready", readyHandler);
		this.eventHandlers.set("interactionCreate", interactionHandler);
		this.eventHandlers.set("messageCreate", messageHandler);

		// Добавляем обработчики
		this.client.once("ready", readyHandler);
		this.client.on("interactionCreate", interactionHandler);
		this.client.on("messageCreate", messageHandler);
	}

	public async start(token: string): Promise<void> {
		try {
			await this.client.login(token);
		} catch (error) {
			this.log("error", LOG_MESSAGES.LOGIN_ERROR);
			throw error;
		}
	}

	public removeEvents(): void {
		// Удаляем обработчики по сохраненным ссылкам
		for (const [event, handler] of this.eventHandlers) {
			this.client.off(
				event as keyof ClientEvents,
				handler as (...args: any[]) => void,
			);
		}
		this.eventHandlers.clear();
	}

	public initEvents(): void {
		this.setupEvents();
	}

	public async destroy(): Promise<void> {
		this.removeEvents();
		await this.client.destroy();
	}

	private log(
		level: "info" | "error",
		message: { key: string; params?: Record<string, any> },
	): void {
		this.logger[level](this.locale.t(message.key as any, message.params));
	}
}

// Создаём синглтон для обратной совместимости
export const bot = new Bot();

// Оставляем createBot для создания новых экземпляров при необходимости
export const createBot = () => new Bot();
