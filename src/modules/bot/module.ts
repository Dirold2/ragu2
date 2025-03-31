import { importx } from "@discordx/importer";
import { Module } from "../../core/Module.js";
import { bot } from "./bot.js";
import { ModuleState, type ModuleMetadata } from "../../types/index.js";
import packageJson from "./package.json" with { type: "json" };
import translations from "./locales/en.json" with { type: "json" };
import { createLocale } from "../../utils/index.js";

import { config } from "dotenv";
import { dirname } from "dirname-filename-esm";
import { resolve } from "path";

// Load environment variables from .env file
config({ path: resolve(dirname(import.meta), ".env") });

/**
 * Discord bot module that handles bot initialization and lifecycle
 */
export default class BotModule extends Module {
	constructor() {
		super();
		this.logger.debug("Creating BotModule instance");
	}

	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace("@ragu2/", ""),
		version: packageJson.version,
		description: packageJson.description,
		dependencies: ["database"],
		priority: 90,
	};

	public locale = createLocale<typeof translations>(
		packageJson.name.replace("@ragu2/", ""),
	);

	// Define module exports with a clear interface
	public readonly exports = {
		getBot: () => {
			this.logger.debug("Accessing bot instance through exports");
			return bot;
		},
		getClient: () => {
			this.logger.debug("Accessing bot client through exports");
			return bot.client;
		},
	} as const;

	/**
	 * Initialize the bot module
	 */
	protected async onInitialize(): Promise<void> {
		try {
			await this.locale.load();
			await this.locale.setLanguage(process.env.BOT_LOCALE || "en");

			// Устанавливаем moduleManager перед инициализацией
			bot.moduleManager = this.moduleManager!;
			await bot.initialize();
		} catch (error: unknown) {
			this.logger.error("Failed to initialize bot module:", error);
			this.handleError("initialization", error);
		}
	}

	/**
	 * Start the bot module
	 */
	protected async onStart(): Promise<void> {
		try {
			await this.loadCommands();
			await this.startBot();
		} catch (error) {
			this.logger.error("Failed to start bot module", error);
			throw error;
		}
	}

	/**
	 * Stop the bot module
	 */
	protected async onStop(): Promise<void> {
		try {
			await this.stopBot();
		} catch (error) {
			this.logger.error("Failed to stop bot module", error);
			throw error;
		}
	}

	/**
	 * Load bot commands and events
	 */
	private async loadCommands(): Promise<void> {
		try {
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug("Loading bot commands and events...");
			}

			// Use importx to load all commands and events
			await importx(`${dirname(import.meta)}/{events,commands}/**/*.{ts,js}`);

			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug("Bot commands and events loaded successfully");
			}
		} catch (error) {
			this.logger.error("Failed to load bot commands", error);
			throw error;
		}
	}

	/**
	 * Start the Discord bot
	 */
	private async startBot(): Promise<void> {
		if (!process.env.DISCORD_TOKEN) {
			throw new Error(this.locale.t("messages.bot.token.error"));
		}

		await bot.start(process.env.DISCORD_TOKEN);
	}

	/**
	 * Stop the Discord bot
	 */
	private async stopBot(): Promise<void> {
		await bot.destroy();
		this.logger.info({
			message: this.locale.t("bot.status.stopped"),
			moduleState: ModuleState.STOPPED,
		});
	}
}

// Export a singleton instance
export const module = new BotModule();
