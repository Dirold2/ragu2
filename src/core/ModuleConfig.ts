import fs from "fs/promises";
import path from "path";
import { createLogger } from "../utils/logger.js";
import { dirname } from "dirname-filename-esm";

const __dirname = dirname(import.meta);

/**
 * Manages configuration for modules
 */
export class ModuleConfig {
	private configs: Map<string, Record<string, any>> = new Map();
	private configPath: string;
	private logger = createLogger("ModuleConfig");

	constructor(configPath?: string) {
		this.configPath = configPath || path.resolve(__dirname, "../config");
	}

	/**
	 * Load configuration for all modules
	 */
	public async loadAllConfigs(): Promise<void> {
		try {
			// Ensure config directory exists
			await fs.mkdir(this.configPath, { recursive: true });

			// Read all config files
			const files = await fs.readdir(this.configPath);
			const configFiles = files.filter((file) => file.endsWith(".json"));

			for (const file of configFiles) {
				const moduleName = path.basename(file, ".json");
				await this.loadConfig(moduleName);
			}

			// Only log in debug mode or if there are configs
			if (this.configs.size > 0 || process.env.LOG_LEVEL === "debug") {
				this.logger.info(
					`Loaded configuration for ${this.configs.size} modules`,
				);
			}
		} catch (error) {
			this.logger.error("Failed to load module configurations", error);
		}
	}

	/**
	 * Load configuration for a specific module
	 */
	public async loadConfig(moduleName: string): Promise<Record<string, any>> {
		try {
			const configFile = path.join(this.configPath, `${moduleName}.json`);
			const configData = await fs.readFile(configFile, "utf-8");
			const config = JSON.parse(configData);

			this.configs.set(moduleName, config);

			// Only log in debug mode
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Loaded configuration for module: ${moduleName}`);
			}

			return config;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				this.logger.error(
					`Failed to load configuration for module: ${moduleName}`,
					error,
				);
			}

			// Return empty config if file doesn't exist
			return {};
		}
	}

	/**
	 * Save configuration for a module
	 */
	public async saveConfig(
		moduleName: string,
		config: Record<string, any>,
	): Promise<void> {
		try {
			const configFile = path.join(this.configPath, `${moduleName}.json`);
			await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf-8");

			this.configs.set(moduleName, config);

			// Only log in debug mode
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Saved configuration for module: ${moduleName}`);
			}
		} catch (error) {
			this.logger.error(
				`Failed to save configuration for module: ${moduleName}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Get configuration for a module
	 */
	public getConfig<T = Record<string, any>>(moduleName: string): T {
		return (this.configs.get(moduleName) || {}) as T;
	}

	/**
	 * Update configuration for a module
	 */
	public async updateConfig(
		moduleName: string,
		updates: Record<string, any>,
	): Promise<Record<string, any>> {
		const currentConfig = this.getConfig(moduleName);
		const newConfig = { ...currentConfig, ...updates };

		await this.saveConfig(moduleName, newConfig);
		return newConfig;
	}
}
