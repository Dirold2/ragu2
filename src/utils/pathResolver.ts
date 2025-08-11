import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

/**
 * Utility class for resolving project paths correctly
 */
export class PathResolver {
	private static projectRoot: string | null = null;

	/**
	 * Get the project root directory
	 */
	static getProjectRoot(): string {
		if (this.projectRoot) {
			return this.projectRoot;
		}

		// Try to find project root by looking for package.json
		let currentDir = process.cwd();

		while (currentDir !== "/" && currentDir !== ".") {
			const packageJsonPath = join(currentDir, "package.json");
			if (existsSync(packageJsonPath)) {
				this.projectRoot = currentDir;
				return this.projectRoot;
			}
			currentDir = dirname(currentDir);
		}

		// Fallback to current working directory
		this.projectRoot = process.cwd();
		return this.projectRoot;
	}

	/**
	 * Get the src directory path
	 */
	static getSrcPath(): string {
		const projectRoot = this.getProjectRoot();
		return join(projectRoot, "src");
	}

	/**
	 * Get the locales directory path
	 */
	static getLocalesPath(): string {
		const srcPath = this.getSrcPath();
		return join(srcPath, "locales");
	}

	/**
	 * Get path relative to project root
	 */
	static getProjectPath(...paths: string[]): string {
		const projectRoot = this.getProjectRoot();
		return join(projectRoot, ...paths);
	}

	/**
	 * Get path relative to src directory
	 */
	static getSrcRelativePath(...paths: string[]): string {
		const srcPath = this.getSrcPath();
		return join(srcPath, ...paths);
	}

	/**
	 * Check if a path exists
	 */
	static pathExists(path: string): boolean {
		return existsSync(path);
	}

	/**
	 * Get current file directory (for ES modules)
	 */
	static getCurrentDir(importMetaUrl: string): string {
		return dirname(fileURLToPath(importMetaUrl));
	}

	/**
	 * Debug: log all attempted paths
	 */
	static debugPaths(): void {
		console.debug("=== Path Resolver Debug ===");
		console.debug("Process CWD:", process.cwd());
		console.debug("Project Root:", this.getProjectRoot());
		console.debug("Src Path:", this.getSrcPath());
		console.debug("Locales Path:", this.getLocalesPath());
		console.debug("Locales exists:", this.pathExists(this.getLocalesPath()));
		console.debug("=========================");
	}
}
