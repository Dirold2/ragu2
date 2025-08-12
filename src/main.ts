import { dirname } from "dirname-filename-esm";

import { importx } from "@discordx/importer";

import { bot } from "./bot.js";
import { createLocale, createLogger } from "./utils/index.js";
import { registerShutdownHandlers } from "./utils/gracefulShutdown.js";
import translations from "./locales/en.json" with { type: "json" };

import { config } from "@dotenvx/dotenvx";
import { resolve } from "path";

config({ path: resolve(dirname(import.meta), "../.env") });

const __dirname = dirname(import.meta);

const logger = createLogger(`ragu2`);
const locale = createLocale<typeof translations>(`ragu2`);
locale.load();

/**
 * Runs the bot
 */
async function run() {
	// Регистрируем обработчики graceful shutdown
	registerShutdownHandlers();

	await bot.initialize();

	logger.info(locale.t("messages.bot.initialization.success"));

	await importx(`${__dirname}/{events,commands}/**/*.{ts,js}`);

	if (!process.env.DISCORD_TOKEN) {
		throw Error(`No token`);
	}

	await bot.start(process.env.DISCORD_TOKEN);

	logger.info(locale.t("messages.bot.start.success"));
}

void run();
