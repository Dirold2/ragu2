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

import {
	CommandService,
	NameService,
	PlayerManager,
	PluginManager,
	ProxyService,
} from "./services/index.js";

import { createLogger, createLocale } from "../../utils/index.js";
import translations from "./locales/en.json" with { type: "json" };

import { config } from "dotenv";
import { dirname } from "dirname-filename-esm";
import { resolve } from "path";
import { ModuleManager } from "../../core/ModuleManager.js";
import { ModuleState } from "../../types/index.js";

config({ path: resolve(dirname(import.meta), ".env") });

/**
 * Bot class
 */
export class Bot {
	public readonly client: Client;
	public moduleManager!: ModuleManager;
	public databaseModule: any;
	public nameService!: NameService;
	public queueService: any;
	public playerManager!: PlayerManager;
	public commandService!: CommandService;
	public proxyService!: ProxyService;
	public pluginManager!: PluginManager;
	public readonly logger = createLogger("bot");
	public readonly locale = createLocale<typeof translations>("bot");
	private eventHandlers: Map<
		string,
		(event: Interaction | Message<boolean>) => void
	> = new Map();
	public prisma: any;

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

	/**
	 * Initialize bot
	 */
	public async initialize(): Promise<void> {
		try {
			await this.locale.load();
			await this.locale.setLanguage(process.env.BOT_LOCALE || "en");

			this.connectToModule();
			this.setupEvents();
			await this.initServices();

			this.logger.info(this.locale.t("bot.status.initialized"));
		} catch (error) {
			this.logger.error(this.locale.t("bot.status.init_failed"));
			throw error;
		}
	}

	/**
	 * Connect to module
	 */
	private connectToModule(): void {
		if (!this.moduleManager) {
			this.logger.warn("ModuleManager not available, cannot connect to module");
			return;
		}

		this.databaseModule =
			this.moduleManager.getModule<
				typeof import("../database/module.js").module
			>("database");

		if (this.databaseModule?.exports?.getQueueService?.()) {
			this.queueService = this.databaseModule.exports.getQueueService();
			this.prisma = this.databaseModule.prisma;
			this.logger.info({
				message: "Модуль базы данных успешно подключен",
				moduleState: ModuleState.INITIALIZED,
			});
		} else {
			this.logger.warn(
				"Could not connect to database module or it has no queue service",
			);
		}
	}

	/**
	 * Initialize services
	 */
	private async initServices(): Promise<void> {
		try {
			this.commandService = new CommandService();
			this.pluginManager = new PluginManager();
			await this.loadPlugins();

			if (!this.queueService && this.databaseModule) {
				this.queueService = this.databaseModule.exports.getQueueService();
			}

			if (!this.queueService) {
				throw new Error("QueueService не может быть инициализирован");
			}

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
			this.logger.error(this.locale.t("messages.bot.initialization.failed"));
			throw error;
		}
	}

	/**
	 * Load plugins
	 */
	private async loadPlugins(): Promise<void> {
		const pluginsDir = path.resolve(dirname(import.meta), "plugins");

		try {
			const files = await fs.promises.readdir(pluginsDir);
			const pluginFiles = files.filter(
				(file) => file.endsWith(".ts") || file.endsWith(".js"),
			);

			await Promise.all(
				pluginFiles.map(async (file) => {
					try {
						const pluginPath = String(
							pathToFileURL(path.join(pluginsDir, file)),
						);
						const { default: Plugin } = await import(pluginPath);
						const plugin = new Plugin();
						this.pluginManager.registerPlugin(plugin);
						this.logger.debug(`Plugin loaded: ${file}`);
					} catch (error) {
						this.logger.error(
							this.locale.t("logger.plugin.register_error", { file }),
							error,
						);
					}
				}),
			);
		} catch (error) {
			this.logger.error(this.locale.t("logger.plugin.register_error"));
			throw error;
		}
	}

	/**
	 * Setup events
	 */
	private setupEvents(): void {
		const readyHandler = async () => {
			try {
				await this.client.initApplicationCommands();
			} catch (error) {
				this.logger.error(this.locale.t("bot.status.init_failed"), error);
			}
		};

		const interactionHandler = (interaction: Interaction) => {
			this.client.executeInteraction(interaction);
		};

		const messageHandler = (message: Message<boolean>) => {
			void this.client.executeCommand(message);
		};

		this.eventHandlers.set("ready", readyHandler);
		this.eventHandlers.set(
			"interactionCreate",
			interactionHandler as (...args: unknown[]) => void,
		);
		this.eventHandlers.set(
			"messageCreate",
			messageHandler as (...args: unknown[]) => void,
		);

		this.client.once("ready", readyHandler);
		this.client.on("interactionCreate", interactionHandler);
		this.client.on("messageCreate", messageHandler);

		this.logger.debug("Discord client events are set");
	}

	/**
	 * Start bot
	 */
	public async start(token: string): Promise<void> {
		try {
			await this.client.login(token);
			this.logger.info(this.locale.t("messages.bot.start.success"));
		} catch (error) {
			this.logger.error(this.locale.t("messages.bot.start.error"));
			throw error;
		}
	}

	/**
	 * Remove events
	 */
	public removeEvents(): void {
		for (const [event, handler] of this.eventHandlers) {
			this.client.off(
				event as keyof ClientEvents,
				handler as (...args: unknown[]) => void,
			);
		}
		this.eventHandlers.clear();
	}

	/**
	 * Initialize events
	 */
	public initEvents(): void {
		this.setupEvents();
	}

	/**
	 * Destroy bot
	 */
	public async destroy(): Promise<void> {
		this.removeEvents();
		await this.client.destroy();
	}
}

export const bot = new Bot();

export const createBot = () => new Bot();
