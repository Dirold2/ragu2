import {
	type ClientEvents,
	IntentsBitField,
	type Interaction,
	type Message,
} from "discord.js";
import { Client } from "discordx";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import {
	CacheQueueService,
	CommandService,
	NameService,
	PlayerManager,
	PluginManager,
} from "./services/index.js";

import { dirname } from "dirname-filename-esm";
import translations from "./locales/en.json" with { type: "json" };
import { createLogger, createLocale } from "./utils/index.js";
import { MusicServicePlugin } from "./interfaces/index.js";

/**
 * Bot class
 */
export class Bot {
	public readonly client: Client;
	public nameService!: NameService;
	public queueService!: CacheQueueService;
	public databaseModule: any;
	public playerManager!: PlayerManager;
	public commandService!: CommandService;
	public pluginManager!: PluginManager;
	public logger = createLogger(`ragu2`);
	public locale = createLocale<typeof translations>(`ragu2`);
	private eventHandlers: Map<
		string,
		(event: Interaction | Message<boolean>) => void
	> = new Map();

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

			this.setupEvents();
			await this.initServices();
		} catch (error) {
			this.logger.error(this.locale.t("messages.bot.status.init_failed"));
			throw error;
		}
	}

	/**
	 * Initialize services
	 */
	private async initServices(): Promise<void> {
		try {
			this.commandService = new CommandService();
			this.pluginManager = new PluginManager();
			this.loadPlugins();

			if (this.databaseModule?.exports?.getQueueService?.()) {
				this.queueService = this.databaseModule?.exports?.getQueueService?.();
			} else {
				this.queueService = new CacheQueueService();
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

	private isMusicServicePlugin(obj: any): obj is MusicServicePlugin {
		return (
			obj &&
			typeof obj.name === "string" &&
			Array.isArray(obj.urlPatterns) &&
			typeof obj.searchName === "function" &&
			typeof obj.getTrackUrl === "function"
		);
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
					const pluginPath = String(pathToFileURL(path.join(pluginsDir, file)));
					try {
						const imported = await import(pluginPath);
						const PluginConstructor = imported?.default;

						if (typeof PluginConstructor !== "function") {
							this.logger.warn(
								this.locale.t("messages.bot.warnings.invalid_plugin_export", {
									file,
								}),
								{ file },
							);
							return;
						}

						const pluginInstance = new PluginConstructor();

						if (!this.isMusicServicePlugin(pluginInstance)) {
							this.logger.warn(
								this.locale.t("messages.bot.warnings.plugin_shape_mismatch", {
									file,
								}),
								{ file, plugin: pluginInstance },
							);
							return;
						}

						const registered =
							this.pluginManager.registerPlugin(pluginInstance);
						if (registered) {
							if (pluginInstance.disabled) {
								this.logger.debug(
									this.locale.t("messages.bot.info.plugin_loaded_disabled", {
										file,
										name: pluginInstance.name,
									}),
									{ plugin: pluginInstance.name },
								);
							} else {
								this.logger.info(
									this.locale.t("messages.bot.info.plugin_loaded", { file }),
									{ plugin: pluginInstance.name },
								);
							}
						}
					} catch (error) {
						this.logger.error(
							this.locale.t("messages.bot.errors.register_error_files", {
								file,
							}),
							error,
						);
					}
				}),
			);
		} catch (error) {
			this.logger.error(this.locale.t("messages.bot.errors.register_error"));
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
				this.logger.error(
					this.locale.t("messages.bot.status.init_failed"),
					error,
				);
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
		} catch (error) {
			this.logger.error(
				this.locale.t("messages.bot.status.start_error", {
					error: String(error),
				}),
			);
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
