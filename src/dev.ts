import { resolve } from "@discordx/importer";
import chokidar from "chokidar";
import { DIService, MetadataStorage } from "discordx";
import { bot } from "./bot.js";
import logger from './utils/logger.js';
import dotenv from 'dotenv';
import { dirname } from 'dirname-filename-esm';

const __dirname = dirname(import.meta);

dotenv.config();

const commandsPattern = `${__dirname}/commands/**/*.{ts,js}`;
const eventsPattern = `${__dirname}/events/**/*.{ts,js}`;

async function loadFiles(src: string): Promise<void> {
    const files = await resolve(src);
    await Promise.all(
        files.map((file) => import(`${file}?version=${Date.now().toString()}`))
    );
}

async function reload() {
    logger.info("> Reloading modules\n");

    bot.removeEvents();

    MetadataStorage.clear();
    DIService.engine.clearAllServices();

    await loadFiles(commandsPattern);
    await loadFiles(eventsPattern);

    await MetadataStorage.instance.build();
    await bot.client.initApplicationCommands();
    bot.initEvents();

    logger.info("> Reload success\n");
}

async function run() {
    const watcher = chokidar.watch([commandsPattern, eventsPattern], {
        persistent: true,
        ignoreInitial: true
    });

    await loadFiles(commandsPattern);
    await loadFiles(eventsPattern);

    if (!process.env.BOT_TOKEN) {
        throw Error("Could not find BOT_TOKEN in your environment");
    }

    await bot.start(process.env.BOT_TOKEN);

    if (process.env.NODE_ENV !== "production") {
        logger.info(
            "> Hot-Module-Reload enabled in development. Commands and events will automatically reload.",
        );

        watcher.on("add", reload);
        watcher.on("change", reload);
        watcher.on("unlink", reload);
    }
}

run();