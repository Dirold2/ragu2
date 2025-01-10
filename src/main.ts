import { dirname } from 'dirname-filename-esm';
import dotenv from 'dotenv';

import { importx } from '@discordx/importer';

import { bot } from './bot.js';

const __dirname = dirname(import.meta);

dotenv.config();

async function run() {
    await importx(`${__dirname}/{events,commands}/**/*.{ts,js}`);

    if (!process.env.BOT_TOKEN) {
        throw Error("Could not find BOT_TOKEN in your environment");
    }

    await bot.start(process.env.BOT_TOKEN);
}

void run();