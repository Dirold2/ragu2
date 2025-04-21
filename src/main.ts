import { dirname } from "dirname-filename-esm";

import { resolve as r } from "path";

import { importx } from "@discordx/importer";

import { bot } from "./bot.js";
import { config } from "dotenv";
import { createLocale, createLogger } from "./utils/index.js";
import translations from "./locales/en.json" with { type: "json" };

const __dirname = dirname(import.meta);

config({ path: r(dirname(import.meta), ".env") });

const logger = createLogger(`ragu2`);
const locale = createLocale<typeof translations>(`ragu2`);
locale.load();

/**
 * Runs the bot
 */
async function run() {
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
