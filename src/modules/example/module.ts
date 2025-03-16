import { Module } from "../../core/Module.js";
import type { ModuleMetadata } from "../../types/index.js";
import packageJson from "./package.json" with { type: "json" };

export class ExampleModule extends Module {
	public readonly metadata: ModuleMetadata = {
		name: packageJson.name.replace("@ragu2/", ""),
		version: packageJson.version,
		description: packageJson.description,
		priority: 150,
	};

	protected async onInitialize(): Promise<void> {
		await this.locale.load();
		await this.locale.setLanguage(process.env.BOT_LOCALE || "en");
	}

	protected async onStart(): Promise<void> {}

	protected async onStop(): Promise<void> {}
}
