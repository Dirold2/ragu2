import { dirname } from "dirname-filename-esm";
import { IntentsBitField, type Interaction, type Message } from "discord.js";
import { Client } from "discordx";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import dotenv from "dotenv";

import {
	CommandService,
	NameService,
	PlayerManager,
	PluginManager,
	QueueService,
	ProxyService,
} from "./services/index.js";
import logger from "./utils/logger.js";
import { startServer } from "./server.js";
import {
	initializeLanguage,
	type LocaleMessages,
	type LoggerMessages,
} from "./locales/index.js";

const __dirname = dirname(import.meta);
dotenv.config();

class Bot {
	public readonly client: Client;
	public nameService!: NameService;
	public queueService!: QueueService;
	public playerManager!: PlayerManager;
	public commandService!: CommandService;
	public proxyService!: ProxyService;
	public pluginManager!: PluginManager;
	public messages!: LocaleMessages;
	public loggerMessages!: LoggerMessages;
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

		this.initializeServices()
			.then(() => this.setupEventListeners())
			.catch((error) =>
				logger.error(this.messages.ERROR_INITIALIZATION, error),
			);
	}

	/**
	 * Initializes services
	 * @returns {Promise<void>}
	 */
	private async initializeServices(): Promise<void> {
		try {
			this.messages = (await initializeLanguage()).messages;
			this.loggerMessages = (await initializeLanguage()).loggerMessages;
			this.commandService = new CommandService();
			this.pluginManager = new PluginManager();
			await this.registerPlugins();

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
			logger.error(
				`${this.loggerMessages.BOT_FAILED_INITIALIZATION_SERVICES}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Registers plugins
	 * @returns {Promise<void>}
	 */
	private async registerPlugins(): Promise<void> {
		const pluginsDir = path.resolve(__dirname, "plugins");

		try {
			const files = await fs.promises.readdir(pluginsDir);
			await Promise.all(
				files
					.filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
					.map(async (file) => {
						const pluginPath = String(
							pathToFileURL(path.join(pluginsDir, file)),
						);
						try {
							const { default: Plugin } = await import(pluginPath);
							this.pluginManager.registerPlugin(new Plugin());
						} catch (error) {
							logger.error(
								`${this.loggerMessages.PLUGIN_REGISTRATION_FAILED(file)}`,
								error,
							);
						}
					}),
			);
		} catch (error) {
			logger.error(
				`${this.loggerMessages.PLUGIN_REGISTRATION_FAILED_FATAL}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Sets up event listeners
	 */
	private setupEventListeners(): void {
		this.client.once("ready", this.handleReady.bind(this));
		this.client.on("interactionCreate", this.handleInteraction.bind(this));
		this.client.on("messageCreate", this.handleMessage.bind(this));
	}

	/**
	 * Handles the bot being ready
	 * @returns {Promise<void>}
	 */
	private async handleReady(): Promise<void> {
		try {
			await this.client.initApplicationCommands();
			logger.info(`${this.loggerMessages.BOT_INITIALIZED}`);

			await startServer();
			logger.info(`${this.loggerMessages.API_SERVER_STARTED_SUCCESSFULLY}`);
		} catch (error) {
			logger.error(`${this.loggerMessages.BOT_INITIALIZATION_FAILED}`, error);
		}
	}

	/**
	 * Handles interactions
	 * @param {Interaction} interaction - The interaction to handle
	 */
	private handleInteraction(interaction: Interaction): void {
		this.client.executeInteraction(interaction);
	}

	/**
	 * Handles messages
	 * @param {Message} message - The message to handle
	 */
	private handleMessage(message: Message): void {
		void this.client.executeCommand(message);
	}

	/**
	 * Starts the bot
	 * @param {string} token - The bot token
	 * @returns {Promise<void>}
	 */
	public async start(token: string): Promise<void> {
		try {
			await initializeLanguage();
			await this.client.login(token);
			logger.info(`${this.loggerMessages.BOT_STARTED_SUCCESSFULLY}`);
		} catch (error) {
			logger.error(`${this.loggerMessages.BOT_START_ERROR}:`, error);
			throw error;
		}
	}

	/**
	 * Removes all event listeners
	 */
	public removeEvents(): void {
		this.client.removeAllListeners();
	}

	/**
	 * Initializes event listeners
	 */
	public initEvents(): void {
		this.setupEventListeners();
	}
}

/**
 * The main bot instance
 */
export const bot = new Bot();
