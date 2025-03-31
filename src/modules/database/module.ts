import { Module } from "../../core/Module.js";
import { ModuleState, type ModuleMetadata } from "../../types/index.js";
import { PrismaClient } from "#prisma/default.js";
import packageJson from "./package.json" with { type: "json" };
import { QueueService } from "./services/index.js";
import translations from "./locales/en.json" with { type: "json" };
import { createLocale } from "../../utils/index.js";

import { config } from "dotenv";
import { dirname } from "dirname-filename-esm";
import { resolve } from "path";

config({ path: resolve(dirname(import.meta), ".env") });

// Define the exports interface for type safety
export type DatabaseExports = {
	getPrismaClient: () => PrismaClient;
	getQueueService: () => QueueService;
};

export default class DatabaseModule extends Module {
	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace("@ragu2/", ""),
		version: packageJson.version,
		description: packageJson.description,
		dependencies: [],
		priority: 100,
	};

	public prisma!: PrismaClient;
	public locale = createLocale<typeof translations>(
		packageJson.name.replace("@ragu2/", ""),
	);

	public readonly exports: DatabaseExports = {
		getPrismaClient: () => this.prisma,
		getQueueService: () => new QueueService(),
	};

	protected async onInitialize(): Promise<void> {
		try {
			await this.locale.load();
			await this.locale.setLanguage(process.env.BOT_LOCALE || "en");

			await this.initializePrisma();
		} catch (error) {
			this.logger.error("Failed to initialize database module:", error);
			this.handleError("initialization", error);
		}
	}

	private async initializePrisma(): Promise<void> {
		try {
			const prisma = new PrismaClient();
			await prisma.$connect();
			this.prisma = prisma;

			this.logger.info({
				message: this.locale.t("messages.database.connected"),
				moduleState: ModuleState.INITIALIZED,
			});
		} catch (error) {
			this.logger.error({
				message: this.locale.t("messages.database.connectionError"),
				moduleState: ModuleState.ERROR,
				error,
			});
		}
	}

	protected async onStop(): Promise<void> {
		if (this.prisma) {
			await this.prisma.$disconnect();
			this.logger.info({
				message: this.locale.t("messages.database.disconnected"),
				moduleState: ModuleState.STOPPED,
			});
		}
	}
}

export const module = new DatabaseModule();

export type { PrismaClient };
export type { Queue } from "#prisma/default.js";
export type { Tracks } from "#prisma/default.js";
