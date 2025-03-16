import { Module } from "../../core/Module.js";
import { ApiServer } from "./server.js";
import { Api } from "./api.js";
import { ModuleState, type ModuleMetadata } from "../../types/index.js";

import { config } from "dotenv";
import { dirname } from "dirname-filename-esm";
import { resolve } from "path";

import packageJson from "./package.json" with { type: "json" };

const __dirname = dirname(import.meta);

config({ path: resolve(__dirname, ".env") });

export default class ApiModule extends Module {
	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace("@ragu2/", ""),
		version: packageJson.version,
		description: packageJson.description,
		dependencies: ["bot"],
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
		await this.setupServer();
	}

	protected async onStart(): Promise<void> {
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
		this.logger.info({
			message: this.locale.t("logger.server.started", { port: String(port) }),
			moduleState: ModuleState.RUNNING,
		});
	}

	private async stopServer(): Promise<void> {
		if (this.apiServer) {
			await this.apiServer.stop();
			this.apiServer = null;
			this.api = null;
			this.logger.info({
				message: this.locale.t("logger.server.stopped"),
				moduleState: ModuleState.STOPPED,
			});
		}
	}
}

/**
 * The main module instance
 */
export const module = new ApiModule();
