import { dirname, resolve } from "@discordx/importer";
import chokidar from "chokidar";
import { DIService, MetadataStorage } from "discordx";
import { bot } from "./bot.js";
import logger from './service/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const commandsPattern = `${dirname(import.meta.url)}/commands/**/*.{ts,js}`;
const eventsPattern = `${dirname(import.meta.url)}/events/**/*.{ts,js}`;

async function LoadFiles(src: string): Promise<void> {
    const files = await resolve(src);
    await Promise.all(
        files.map((file) => import(`${file}?version=${Date.now().toString()}`))
    );
}

async function Reload() {
    logger.info("> Reloading modules\n");

    // Remove events
    bot.removeEvents();

    // cleanup
    MetadataStorage.clear();
    DIService.engine.clearAllServices();

    // reload files
    await LoadFiles(commandsPattern);
    await LoadFiles(eventsPattern);

    // rebuild
    await MetadataStorage.instance.build();
    await bot.initApplicationCommands();
    bot.initEvents();

    logger.info("> Reload success\n");
}

async function run() {
    const watcher = chokidar.watch([commandsPattern, eventsPattern], {});

    // Load commands
    await LoadFiles(commandsPattern);
    await LoadFiles(eventsPattern);

    // Let's start the bot
    if (!process.env.BOT_TOKEN) {
        throw Error("Could not find BOT_TOKEN in your environment");
    }

    // Log in with your bot token
    await bot.login(process.env.BOT_TOKEN);

    // Hot Module reload
    if (process.env.NODE_ENV !== "production") {
        logger.info(
            "> Hot-Module-Reload enabled in development. Commands and events will automatically reload.",
        );

        // Watch changed files using chikidar
        watcher.on("add", () => void Reload());
        watcher.on("change", () => void Reload());
        watcher.on("unlink", () => void Reload());
    }
}

void run();