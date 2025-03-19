import { Module } from "../../core/Module.js";
import { ModuleState, type ModuleMetadata } from "../../types/index.js";
import { PrismaClient } from "@prisma/client";
import packageJson from "./package.json" with { type: "json" };

// Define the exports interface for type safety
export interface DatabaseExports extends Record<string, unknown> {
	getPrismaClient: () => PrismaClient;
}

export default class DatabaseModule extends Module<DatabaseExports> {
	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace("@ragu2/", ""),
		version: packageJson.version,
		description: packageJson.description,
		dependencies: [],
		priority: 100,
	};

	private prisma: PrismaClient | null = null;

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
			// throw error;
		}
	}

	protected async onInitialize(): Promise<void> {
		try {
			await this.locale.load();
			await this.locale.setLanguage(process.env.BOT_LOCALE || "en");
			await this.initializePrisma();
		} catch (error) {
			this.handleError("initialization", error);
			// throw error;
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
