import { importx } from "@discordx/importer";
import { Module } from "../../core/Module.js";
import { bot } from "./bot.js";
import { ModuleState, type ModuleMetadata } from "../../types/index.js";
import packageJson from "./package.json" with { type: "json" };

import { config } from "dotenv";
import { dirname } from "dirname-filename-esm";
import { resolve } from "path";
import type { DatabaseExports } from "./types/index.ts";

const __dirname = dirname(import.meta);

config({ path: resolve(__dirname, "./.env") });

export default class BotModule extends Module {
	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace("@ragu2/", ""),
		version: packageJson.version,
		description: packageJson.description,
		dependencies: ["database"],
		priority: 100,
	};

	public readonly exports = {
		getBot: () => bot,
	} as const;

	protected async onInitialize(): Promise<void> {
		try {
			await this.locale.load();
			await this.locale.setLanguage(process.env.BOT_LOCALE || "en");

			// Проверяем наличие модуля database
			const database = this.getModuleExports<DatabaseExports>("database");
			if (!database) {
				throw new Error("Database module is required but not loaded");
			}

			const prisma = database.getPrismaClient();
			if (!prisma) {
				throw new Error("Failed to get Prisma client from database module");
			}

			// Теперь можно использовать prisma для работы с БД
			await bot.initialize(prisma);
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(`Failed to initialize bot module: ${errorMessage}`);
			throw error;
		}
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

export const module = new BotModule();
