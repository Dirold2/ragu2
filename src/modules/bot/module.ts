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

config({ path: resolve(__dirname, ".env") });

export default class BotModule extends Module {
	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace('@ragu2/', ''),
		version: packageJson.version,
		description: packageJson.description,
		dependencies: ['database'],
		priority: 100,
	};

	public readonly exports = {
		getBot: () => bot,
	} as const;

	protected async onInitialize(): Promise<void> {
		await this.locale.load();
		await this.locale.setLanguage(process.env.BOT_LOCALE || "en");
		
		// Получаем клиент Prisma из модуля database
		const database = this.getModuleExports<DatabaseExports>('database');
		const prisma = database.getPrismaClient();
		
		// Теперь можно использовать prisma для работы с БД
		await bot.initialize(prisma);
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
			moduleState: ModuleState.RUNNING 
		});
	}

	private async stopBot(): Promise<void> {
		bot.destroy();
		this.logger.info({ 
			message: `${this.locale.t("bot.status.stopped")}`,
			moduleState: ModuleState.STOPPED 
		});
	}
}

export const module = new BotModule();
