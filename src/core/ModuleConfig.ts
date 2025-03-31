import path from "path";
import { createLogger } from "../utils/logger.js";
import { dirname } from "dirname-filename-esm";
import fs from "node:fs/promises";

const __dirname = dirname(import.meta);

/**
 * Type for module configuration
 */
export type ModuleConfigData = Record<string, unknown>;

/**
 * Manages configuration for modules with type safety
 */
export class ModuleConfig {
	private configs: Map<string, ModuleConfigData> = new Map();
	private configPath: string;
	private logger = createLogger("ModuleConfig");

	/**
	 * Creates a new ModuleConfig instance
	 * @param configPath Optional custom path for configuration files
	 */
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

			// Load each config file in parallel for better performance
			await Promise.all(
				configFiles.map(async (configFile) => {
					const moduleName = path.basename(configFile, ".json");
					await this.loadConfig(moduleName);
				}),
			);

			// Only log in debug mode or if there are configs
			if (this.configs.size > 0 || process.env.LOG_LEVEL === "debug") {
				this.logger.info(
					`Loaded configuration for ${this.configs.size} modules`,
				);
			}
		} catch (error) {
			this.logger.error("Failed to load module configurations", error);
			throw error; // Re-throw to allow caller to handle
		}
	}

	/**
	 * Load configuration for a specific module
	 */
	public async loadConfig(moduleName: string): Promise<ModuleConfigData> {
		try {
			const configFile = path.join(this.configPath, `${moduleName}.json`);

			// Use more efficient file reading with Bun
			const fileContent = await Bun.file(configFile).text();
			const config = JSON.parse(fileContent);

			this.configs.set(moduleName, config);

			// Only log in debug mode
			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Loaded configuration for module: ${moduleName}`);
			}

			return config;
		} catch (error) {
			// Only log real errors, not missing files
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				this.logger.error(
					`Failed to load configuration for module: ${moduleName}`,
					error,
				);
			}

			// Return empty config if file doesn't exist
			const emptyConfig = {} as ModuleConfigData;
			this.configs.set(moduleName, emptyConfig);
			return emptyConfig;
		}
	}

	/**
	 * Save configuration for a module
	 */
	public async saveConfig(
		moduleName: string,
		config: ModuleConfigData,
	): Promise<void> {
		try {
			const configFile = path.join(this.configPath, `${moduleName}.json`);

			// Use Bun's optimized file writing
			await Bun.write(configFile, JSON.stringify(config, null, 2));
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
	 * Get configuration for a module with type safety
	 */
	public getConfig<T extends ModuleConfigData = ModuleConfigData>(
		moduleName: string,
	): T {
		return (this.configs.get(moduleName) || {}) as T;
	}

	/**
	 * Update configuration for a module
	 */
	public async updateConfig(
		moduleName: string,
		updates: Partial<ModuleConfigData>,
	): Promise<ModuleConfigData> {
		const currentConfig = this.getConfig(moduleName);
		const newConfig = { ...currentConfig, ...updates };

		await this.saveConfig(moduleName, newConfig);
		return newConfig;
	}

	/**
	 * Check if a module has configuration
	 */
	public hasConfig(moduleName: string): boolean {
		return this.configs.has(moduleName);
	}

	/**
	 * Delete a module's configuration
	 */
	public async deleteConfig(moduleName: string): Promise<boolean> {
		try {
			const configFile = path.join(this.configPath, `${moduleName}.json`);
			await fs.unlink(configFile);
			this.configs.delete(moduleName);

			if (process.env.LOG_LEVEL === "debug") {
				this.logger.debug(`Deleted configuration for module: ${moduleName}`);
			}

			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				this.logger.error(
					`Failed to delete configuration for module: ${moduleName}`,
					error,
				);
			}
			return false;
		}
	}
}
