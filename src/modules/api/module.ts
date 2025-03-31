import { Module } from "../../core/Module.js";
import { ApiServer } from "./server.js";
import { Api } from "./api.js";
import { ModuleState, type ModuleMetadata } from "../../types/index.js";

import { config } from "dotenv";
import { dirname } from "dirname-filename-esm";
import { resolve } from "path";

import { createLocale } from "../../utils/index.js";
import packageJson from "./package.json" with { type: "json" };
import translations from "./locales/en.json" with { type: "json" };

// Load environment variables
config({ path: resolve(dirname(import.meta), ".env") });

/**
 * API module that provides HTTP endpoints for the application
 */
export default class ApiModule extends Module {
	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace("@ragu2/", ""),
		version: packageJson.version,
		description: packageJson.description,
		dependencies: ["bot"],
		priority: 50,
	};

	// Define module exports with a clear interface
	public readonly exports = {
		getServer: () => this.apiServer,
		getApi: () => this.api,
	} as const;

	private apiServer: ApiServer | null = null;
	private api: Api | null = null;
	public locale = createLocale<typeof translations>(
		packageJson.name.replace("@ragu2/", ""),
	);

	/**
	 * Initialize the API module
	 */
	protected async onInitialize(): Promise<void> {
		// Load localization resources
		await this.locale.load();
		await this.locale.setLanguage(process.env.BOT_LOCALE || "en");

		// Set up the API server
		await this.setupServer();
	}

	/**
	 * Start the API module
	 */
	protected async onStart(): Promise<void> {
		await this.startServer();
	}

	/**
	 * Stop the API module
	 */
	protected async onStop(): Promise<void> {
		await this.stopServer();
	}

	/**
	 * Set up the API server and routes
	 */
	private async setupServer(): Promise<void> {
		try {
			this.apiServer = new ApiServer();
			const server = await this.apiServer.create();
			this.api = new Api(server, this.locale, this.moduleManager!);

			// Set up API routes
			this.api.setupRoutes();

			// Get module exports using the ModuleManager
			this.connectToModule();
		} catch (error) {
			this.logger.error("Failed to setup API server:", error);
			this.handleError("setup", error);
		}
	}

	/**
	 * Connect to module
	 */
	private connectToModule(): void {
		if (!this.moduleManager) {
			this.logger.warn("ModuleManager not available, cannot connect to module");
			return;
		}

		const bot =
			this.moduleManager!.getModule<typeof import("../bot/module.js").module>(
				"bot",
			);

		if (bot) {
			this.logger.info({
				message: `Connected to bot`,
				moduleState: ModuleState.INITIALIZED,
			});
		} else {
			this.logger.warn("Could not connect to bot module");
		}
	}

	/**
	 * Start the API server
	 */
	private async startServer(): Promise<void> {
		if (!this.apiServer) {
			throw new Error("API server not initialized");
		}

		await this.apiServer.start();
		const port = Number(process.env.API_PORT) || 1750;

		this.logger.info({
			message: this.locale.t("logger.server.started", { port: String(port) }),
			moduleState: ModuleState.STARTING,
		});
	}

	/**
	 * Stop the API server
	 */
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

// Export a singleton instance
export const module = new ApiModule();
