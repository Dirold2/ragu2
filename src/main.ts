import { dirname } from "dirname-filename-esm";
import dotenv from "dotenv";

import { importx } from "@discordx/importer";

import { bot } from "./bot.js";

const __dirname = dirname(import.meta);

dotenv.config();

/**
 * Runs the bot
 */
async function run() {
	await importx(`${__dirname}/{events,commands}/**/*.{ts,js}`);

	if (!process.env.DISCORD_TOKEN) {
		throw Error(`${bot.loggerMessages.BOT_NOT_ENV_TOKEN}`);
	}

	await bot.start(process.env.DISCORD_TOKEN);
}

void run();
