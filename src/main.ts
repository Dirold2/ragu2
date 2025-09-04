import { dirname } from "dirname-filename-esm";

import { importx } from "@discordx/importer";

import { bot } from "./bot.js";
import { createLocale, createLogger } from "./utils/index.js";
import { registerShutdownHandlers } from "./utils/gracefulShutdown.js";
import translations from "./locales/en.json" with { type: "json" };

import { config } from "@dotenvx/dotenvx";
import { resolve } from "path";
import { setGlobalDispatcher, Agent } from "undici";

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

	// Increase undici connect timeout to reduce Discord connection timeouts
	try {
		setGlobalDispatcher(new Agent({ connect: { timeout: 20000 } }));
	} catch {}

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
