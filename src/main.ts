import { dirname, importx } from "@discordx/importer";
import { bot } from "./bot.js";
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);

    if (!process.env.BOT_TOKEN) {
        throw Error("Could not find BOT_TOKEN in your environment");
    }

    await bot.start(process.env.BOT_TOKEN);
}

void run();