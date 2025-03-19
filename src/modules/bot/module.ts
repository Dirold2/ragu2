import { importx } from "@discordx/importer";
import { Module } from "../../core/Module.js";
import { bot } from "./bot.js";
import { ModuleState, type ModuleMetadata } from "../../types/index.js";
import packageJson from "./package.json" with { type: "json" };

import { config } from "dotenv";
import { dirname } from "dirname-filename-esm";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
const __dirname = dirname(import.meta);

// Load environment variables from .env file
config({ path: resolve(__dirname, "./.env") });

// Define the exports interface for type safety
export interface BotExports extends Record<string, unknown> {
	getBot: () => typeof bot;
}

// Define the imports interface for type safety
interface BotModuleImports extends Record<string, unknown> {
	database: {
		getPrismaClient: () => PrismaClient;
	};
}

export default class BotModule extends Module<BotExports, BotModuleImports> {
	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace("@ragu2/", ""),
		version: packageJson.version,
		description: packageJson.description,
		dependencies: ["database"],
		priority: 90, // High priority but after database
	};

	// Define module exports
	public readonly exports: BotExports = {
		getBot: () => bot,
	};

	protected async onInitialize(): Promise<void> {
		try {
			await this.locale.load();
			await this.locale.setLanguage(process.env.BOT_LOCALE || "en");
			// Initialize the bot with prisma
			await bot.initialize();

			this.logger.info({
				message: "Bot module initialized",
				moduleState: ModuleState.INITIALIZED,
			});
		} catch (error: unknown) {
			this.handleError("initialization", error);
			// throw error;
		}
	}

	protected async onStart(): Promise<void> {
		try {
			await this.loadCommands();
			await this.startBot();
		} catch (error) {
			this.logger.error("Failed to start bot module", error);
			throw error;
		}
	}

	protected async onStop(): Promise<void> {
		try {
			await this.stopBot();
		} catch (error) {
			this.logger.error("Failed to stop bot module", error);
			throw error;
		}
	}

	private async loadCommands(): Promise<void> {
		try {
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug("Loading bot commands and events...");
			}

			await importx(`${__dirname}/{events,commands}/**/*.{ts,js}`);

			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug("Bot commands and events loaded successfully");
			}
		} catch (error) {
			this.logger.error("Failed to load bot commands", error);
			throw error;
		}
	}

	private async startBot(): Promise<void> {
		if (!process.env.DISCORD_TOKEN) {
			throw new Error(this.locale.t("messages.bot.token.error"));
		}

		await bot.start(process.env.DISCORD_TOKEN);
		this.logger.info({
			message: `${this.locale.t("bot.status.started")}`,
			moduleState: ModuleState.RUNNING,
		});
	}

	private async stopBot(): Promise<void> {
		bot.destroy();
		this.logger.info({
			message: `${this.locale.t("bot.status.stopped")}`,
			moduleState: ModuleState.STOPPED,
		});
	}
}
