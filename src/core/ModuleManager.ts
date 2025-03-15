import { EventEmitter } from "events";
import { Module } from "./Module.js";
import { createLogger } from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { dirname } from "dirname-filename-esm";
import { ModuleState } from "../types/index.js";
import { clear } from "console";

const __dirname = dirname(import.meta);

export class ModuleManager extends EventEmitter {
	private modules: Map<string, Module>;
	private initialized: boolean;
	private modulesPath: string;
	private logger = createLogger("core");

	constructor(modulesPath?: string) {
		super();
		this.modules = new Map();
		this.initialized = false;
		this.modulesPath = modulesPath || path.resolve(__dirname, "../modules");
	}

	/**
	 * Загружает все модули из директории modules
	 */
	public async loadModules(): Promise<void> {
		// Очищаем консоль перед загрузкой модулей
		clear();

		try {
			const files = await fs.readdir(this.modulesPath);
			const moduleDirectories = (
				await Promise.all(
					files.map(async (file) => {
						const fullPath = path.join(this.modulesPath, file);
						const stat = await fs.stat(fullPath);
						return stat.isDirectory() ? file : null;
					}),
				)
			).filter((dir): dir is string => dir !== null);

			let loadedCount = 0;
			let disabledCount = 0;

			for (const dir of moduleDirectories) {
				const isDevMode = process.env.NODE_ENV === "development";
				const moduleFileName = `module.${isDevMode ? "ts" : "js"}`;
				const modulePath = String(
					pathToFileURL(path.join(this.modulesPath, dir, moduleFileName)),
				);

				try {
					const { default: ModuleClass } = await import(modulePath);
					if (ModuleClass?.prototype instanceof Module) {
						const module = new ModuleClass();
						if (module.disabled) {
							disabledCount++;
							continue;
						}
						await this.registerModule(module);
						loadedCount++;
					}
				} catch (error) {
					this.logger.error(`Failed to load module from ${dir}:`, error);
				}
			}

			if (disabledCount > 0) {
				this.logger.debug(`Disabled modules: ${disabledCount}`);
			}
		} catch (error) {
			this.logger.error("Failed to load modules:", error);
			throw error;
		}
	}

	public async registerModule(module: Module): Promise<void> {
		if (this.modules.has(module.name)) {
			throw new Error(`Module ${module.name} is already registered`);
		}

		if (module.disabled) {
			this.logger.debug(`Module ${module.name} is disabled, skipping registration`);
			return;
		}

		this.modules.set(module.name, module);
	}

	/**
	 * Инициализирует модули в порядке зависимостей
	 */
	public async initializeModules(): Promise<void> {
		if (this.initialized) {
			this.logger.warn("ModuleManager is already initialized");
			return;
		}

		this.logger.info({ 
			message: "Initializing modules...",
			moduleState: ModuleState.INITIALIZED 
		});

		const sortedModules = this.sortModulesByDependencies();

		for (const module of sortedModules) {
			try {
				const currentState = module.getState();
				if (currentState === ModuleState.INITIALIZED) {
					continue;
				}

				const imports: Record<string, unknown> = {};
				for (const depName of module.dependencies) {
					const depModule = this.modules.get(depName);
					if (!depModule) {
						throw new Error(
							`Module ${module.name} depends on ${depName}, but it's not registered`
						);
					}
					if (depModule.getState() !== ModuleState.INITIALIZED) {
						throw new Error(
							`Module ${module.name} depends on ${depName}, but it's not initialized yet`
						);
					}
					imports[depName] = depModule.exports;
				}

				(module as any).setImports(imports);
				await module.initialize();
				
				if (module.getState() !== ModuleState.INITIALIZED) {
					throw new Error(`Module ${module.name} failed to initialize properly`);
				}
			} catch (error) {
				this.logger.error({ 
					message: `${module.name}`,
					moduleState: ModuleState.ERROR,
					error
				});
				throw error;
			}
		}

		this.initialized = true;
	}

	public async startModules(): Promise<void> {
		if (!this.initialized) {
			throw new Error("ModuleManager must be initialized before starting modules");
		}

		const sortedModules = this.sortModulesByDependencies();
		this.logger.info({ 
			message: "Starting modules...",
			moduleState: ModuleState.RUNNING 
		});

		for (const module of sortedModules) {
			try {
				const currentState = module.getState();
				if (currentState === ModuleState.RUNNING) {
					continue;
				}

				await module.start();
				
				if (module.getState() !== ModuleState.RUNNING) {
					throw new Error(`Module ${module.name} failed to start properly`);
				}
			} catch (error) {
				this.logger.error({ 
					message: `${module.name}`,
					moduleState: ModuleState.ERROR,
					error
				});
				throw error;
			}
		}
	}

	public async stopModules(): Promise<void> {
		const sortedModules = this.sortModulesByDependencies().reverse();

		for (const module of sortedModules) {
			try {
				await module.stop();
			} catch (error) {
				this.logger.error({ 
					message: `${module.name}`,
					moduleState: ModuleState.ERROR,
					error
				});
				throw error;
			}
		}

		this.initialized = false;
	}

	private sortModulesByDependencies(): Module[] {
		const visited = new Set<string>();
		const sorted: Module[] = [];
		const visiting = new Set<string>();

		const visit = (moduleName: string) => {
			if (visited.has(moduleName)) return;
			if (visiting.has(moduleName)) {
				throw new Error(
					`Circular dependency detected: ${Array.from(visiting).join(" -> ")} -> ${moduleName}`,
				);
			}

			visiting.add(moduleName);
			const module = this.modules.get(moduleName);
			if (!module) {
				throw new Error(`Module ${moduleName} not found`);
			}

			for (const depName of module.dependencies) {
				visit(depName);
			}

			visiting.delete(moduleName);
			visited.add(moduleName);
			sorted.push(module);
		};

		// Сначала сортируем модули по приоритету
		const modulesByPriority = Array.from(this.modules.entries()).sort(
			([, a], [, b]) => (b.priority || 0) - (a.priority || 0),
		);

		for (const [moduleName] of modulesByPriority) {
			visit(moduleName);
		}

		return sorted;
	}

	public getModule<T extends Module>(name: string): T | undefined {
		return this.modules.get(name) as T | undefined;
	}

	public getModuleStatus(): Array<{
		name: string;
		state: ModuleState;
		disabled: boolean;
		dependencies: string[];
	}> {
		return Array.from(this.modules.entries()).map(([name, module]) => ({
			name,
			state: module.getState(),
			disabled: module.disabled,
			dependencies: module.dependencies
		}));
	}

	public getModuleExports<T = unknown>(moduleName: string): T | undefined {
		const module = this.modules.get(moduleName);
		if (!module) {
			this.logger.warn(`Attempted to get exports from non-existent module: ${moduleName}`);
			return undefined;
		}
		return module.exports as T;
	}
}
