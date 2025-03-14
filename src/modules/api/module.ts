import { Module } from "../../core/Module.js";
import { ApiServer } from "./server.js";
import { Api } from "./api.js";
import type { ModuleMetadata } from "../../types/index.js";

import dotenv from "dotenv";
dotenv.config();

export default class ApiModule extends Module {
	public readonly metadata: ModuleMetadata = {
		name: "api",
		description: "HTTP API module",
		version: "1.0.0",
		dependencies: ["bot"],
		disabled: false,
		priority: 50,
	};

	public readonly exports = {
		getServer: () => this.apiServer,
	} as const;

	private apiServer: ApiServer | null = null;
	private api: Api | null = null;

	protected async onInitialize(): Promise<void> {
		await this.locale.load();
		await this.locale.setLanguage(process.env.BOT_LOCALE || "en");
	}

	protected async onStart(): Promise<void> {
		await this.setupServer();
		await this.startServer();
	}

	protected async onStop(): Promise<void> {
		await this.stopServer();
	}

	private async setupServer(): Promise<void> {
		// const botExports = this.getModuleExports('bot');
		this.apiServer = new ApiServer();
		const server = await this.apiServer.create();
		this.api = new Api(server, this.locale);
		this.api.setupRoutes();
	}

	private async startServer(): Promise<void> {
		if (!this.apiServer) {
			throw new Error("API server not initialized");
		}

		await this.apiServer.start();
		const port = Number(process.env.API_PORT) || 1750;
		this.logger.info(
			this.locale.t("logger.server.started", { port: String(port) }),
		);
	}

	private async stopServer(): Promise<void> {
		if (this.apiServer) {
			await this.apiServer.stop();
			this.apiServer = null;
			this.api = null;
			this.logger.info(this.locale.t("logger.server.stopped"));
		}
	}
}

/**
 * The main module instance
 */
export const module = new ApiModule();
