import { EventEmitter } from "events";
import { Module } from "./Module.js";
import { createLogger } from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { dirname } from "dirname-filename-esm";

const __dirname = dirname(import.meta);

export class ModuleManager extends EventEmitter {
	private modules: Map<string, Module>;
	private initialized: boolean;
	private modulesPath: string;
	private logger = createLogger("ModuleManager");

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

						// Проверяем disabled после создания экземпляра
						if (module.disabled) {
							this.logger.info(`Skipping disabled module: ${module.name}`);
							disabledCount++;
							continue;
						}

						this.registerModule(module);
						loadedCount++;
					}
				} catch (error) {
					this.logger.error(`Failed to load module from ${dir}:`, error);
				}
			}

			this.logger.info(
				`Loaded ${loadedCount} modules` +
					(disabledCount > 0 ? `, ${disabledCount} modules disabled` : ""),
			);
		} catch (error) {
			this.logger.error("Failed to load modules:", error);
			throw error;
		}
	}

	public registerModule(module: Module): void {
		if (this.modules.has(module.name)) {
			throw new Error(`Module ${module.name} is already registered`);
		}

		// Не регистрируем отключенные модули
		if (module.disabled) {
			this.logger.info(
				`Module ${module.name} is disabled, skipping registration`,
			);
			return;
		}

		this.modules.set(module.name, module);
		this.logger.info(`Module ${module.name} registered successfully`);
	}

	/**
	 * Инициализирует модули в порядке зависимостей
	 */
	public async initializeModules(): Promise<void> {
		if (this.initialized) {
			this.logger.warn("ModuleManager is already initialized");
			return;
		}

		// Проверяем наличие всех зависимостей
		for (const [moduleName, module] of this.modules) {
			for (const depName of module.dependencies) {
				if (!this.modules.has(depName)) {
					throw new Error(
						`Module "${moduleName}" requires "${depName}" module, but it's not loaded.`,
					);
				}
			}
		}

		const sortedModules = this.sortModulesByDependencies();

		// Подготавливаем импорты для каждого модуля
		for (const module of sortedModules) {
			const imports: Record<string, unknown> = {};

			for (const depName of module.dependencies) {
				const depModule = this.modules.get(depName);
				if (!depModule) {
					throw new Error(
						`Module ${module.name} depends on ${depName}, but it's not registered`,
					);
				}
				imports[depName] = depModule.exports;
			}

			// Используем protected метод через явное приведение типа
			(module as any).setImports(imports);

			// Инициализируем модуль
			await module.initialize();
		}

		this.initialized = true;
		this.logger.info("All modules initialized successfully");
	}

	public async startModules(): Promise<void> {
		if (!this.initialized) {
			throw new Error(
				"ModuleManager must be initialized before starting modules",
			);
		}

		const sortedModules = this.sortModulesByDependencies();
		for (const module of sortedModules) {
			await module.start();
		}

		this.logger.info("All modules started successfully");
	}

	public async stopModules(): Promise<void> {
		const sortedModules = this.sortModulesByDependencies().reverse();

		for (const module of sortedModules) {
			await module.stop();
		}

		this.logger.info("All modules stopped successfully");
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
}
