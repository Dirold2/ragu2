import { dirname } from "dirname-filename-esm";

import { resolve as r } from "path";

import { importx } from "@discordx/importer";

import { bot } from "./bot.js";
import { config } from "dotenv";

const __dirname = dirname(import.meta);

config({ path: r(dirname(import.meta), ".env") });

/**
 * Runs the bot
 */
async function run() {
	await bot.initialize()

	await importx(`${__dirname}/{events,commands}/**/*.{ts,js}`);

	if (!process.env.DISCORD_TOKEN) {
		throw Error(`No token`);
	}

	await bot.start(process.env.DISCORD_TOKEN);
}

void run();
