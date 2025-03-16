import { Module } from "../../core/Module.js";
import { PrismaClient } from "@prisma/client";
import { ModuleState, type ModuleMetadata } from "../../types/index.js";
import packageJson from "./package.json" with { type: "json" };
import { DatabaseExports } from "./index.js";

export class DatabaseModule extends Module {
	private prismaClient: PrismaClient | null = null;

	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace("@ragu2/", ""),
		version: packageJson.version,
		description: packageJson.description,
		priority: 0,
	};

	protected async onInitialize(): Promise<void> {
		await this.locale.load();
		await this.locale.setLanguage(process.env.BOT_LOCALE || "en");
		await this.init();
	}

	public readonly exports = {
		getPrismaClient: this.getPrismaClient.bind(this),
	} as const satisfies DatabaseExports;

	constructor() {
		super();
	}

	public async init(): Promise<void> {
		try {
			const prisma = new PrismaClient();
			await prisma.$connect();
			this.prismaClient = prisma;
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
			throw error;
		}
	}

	public getPrismaClient(): PrismaClient {
		if (!this.prismaClient) {
			throw new Error(this.locale.t("errors.database.notInitialized"));
		}
		return this.prismaClient;
	}

	public async destroy(): Promise<void> {
		if (this.prismaClient) {
			await this.prismaClient.$disconnect();
			this.logger.info({
				message: this.locale.t("messages.database.disconnected"),
				moduleState: ModuleState.STOPPED,
			});
		}
	}
}

export default DatabaseModule;
