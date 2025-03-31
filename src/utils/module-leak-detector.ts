import { Module } from "../core/Module.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("LeakDetector");

/**
 * Helper class to detect memory leaks in specific modules
 */
export class ModuleLeakDetector {
	private static instances = new Map<string, WeakRef<Module>>();
	private static registry = new FinalizationRegistry<string>(
		(moduleName: string) => {
			ModuleLeakDetector.instances.delete(moduleName);
			logger.debug(`Module ${moduleName} was garbage collected`);
		},
	);

	/**
	 * Track a module instance to detect if it's properly garbage collected
	 */
	public static trackModule(module: Module): void {
		const weakRef = new WeakRef(module);
		this.instances.set(module.name, weakRef);
		this.registry.register(module, module.name);

		logger.debug(`Now tracking module ${module.name} for memory leaks`);
	}

	/**
	 * Check if a module is still in memory
	 */
	public static isModuleInMemory(moduleName: string): boolean {
		const ref = this.instances.get(moduleName);
		if (!ref) return false;

		const module = ref.deref();
		return module !== undefined;
	}

	/**
	 * Get all tracked modules that are still in memory
	 */
	public static getTrackedModules(): string[] {
		const result: string[] = [];

		for (const [moduleName, ref] of this.instances.entries()) {
			const module = ref.deref();
			if (module !== undefined) {
				result.push(moduleName);
			}
		}

		return result;
	}

	/**
	 * Force garbage collection if possible
	 * Note: Node.js must be started with --expose-gc flag
	 */
	public static forceGC(): boolean {
		if (global.gc) {
			global.gc();
			return true;
		}
		return false;
	}

	/**
	 * Check for memory leaks after modules are stopped
	 */
	public static async checkForLeaks(waitTimeMs = 5000): Promise<string[]> {
		logger.info("Checking for module memory leaks...");

		// Force GC if possible
		if (!this.forceGC()) {
			logger.warn(
				"Cannot force garbage collection. Run Node.js with --expose-gc flag for better results.",
			);
		}

		// Wait for GC to potentially run
		await new Promise((resolve) => setTimeout(resolve, waitTimeMs));

		// Force GC again
		this.forceGC();

		// Check which modules are still in memory
		const leakedModules = this.getTrackedModules();

		if (leakedModules.length > 0) {
			logger.warn(
				`Potential memory leaks detected in modules: ${leakedModules.join(", ")}`,
			);
		} else {
			logger.info("No module memory leaks detected.");
		}

		return leakedModules;
	}
}

// Add to Module class to automatically track all modules
export function enableModuleLeakDetection(): void {
	// Patch the Module constructor to track instances
	const originalModule = Module;

	// @ts-ignore - Monkey patching for leak detection
	Module = class extends originalModule {
		constructor(...args: ConstructorParameters<typeof originalModule>) {
			super(...args);

			// Wait until next tick to ensure module is fully constructed
			process.nextTick(() => {
				ModuleLeakDetector.trackModule(this);
			});
		}
	};

	logger.info("Module leak detection enabled");
}
