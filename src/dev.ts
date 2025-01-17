import chokidar from 'chokidar';
import { dirname } from 'dirname-filename-esm';
import { DIService, MetadataStorage } from 'discordx';
import dotenv from 'dotenv';
import { resolve } from '@discordx/importer';
import { bot } from './bot.js';
import logger from './utils/logger.js';
import { MESSAGES } from './messages.js';

const __dirname = dirname(import.meta);
dotenv.config();

const patterns = {
    commands: `${__dirname}/commands/**/*.{ts,js}`,
    events: `${__dirname}/events/**/*.{ts,js}`
};

async function loadFiles(src: string): Promise<void> {
    try {
        const files = await resolve(src);
        await Promise.all(files.map(file => import(`${file}?version=${Date.now()}`)));
    } catch (error) {
        logger.error(`Failed to load files from ${src}:`, error);
        throw error;
    }
}
async function reload() {
    logger.info(`${MESSAGES.RELOADING}`);
    try {
        bot.removeEvents();
        MetadataStorage.clear();
        DIService.engine.clearAllServices();

        await loadFiles(patterns.commands);
        await loadFiles(patterns.events);

        await MetadataStorage.instance.build();
        await bot.client.initApplicationCommands();
        bot.initEvents();

        logger.info(MESSAGES.RELOAD_SUCCESS);
    } catch (error) {
        logger.error(MESSAGES.RELOAD_ERROR, error);
    }
}

async function run() {
    const watcher = chokidar.watch([patterns.commands, patterns.events], {
        persistent: true,
        ignoreInitial: true
    });

    try {
        await loadFiles(patterns.commands);
        await loadFiles(patterns.events);

        const botToken = process.env.BOT_TOKEN;
        if (!botToken) {
            throw new Error(MESSAGES.BOT_TOKEN_ERROR);
        }

        await bot.start(botToken);

        if (process.env.NODE_ENV !== "production") {
            logger.info("> Hot-Module-Reload enabled in development. Commands and events will automatically reload.");
            watcher.on("add", reload);
            watcher.on("change", reload);
            watcher.on("unlink", reload);
        }
    } catch (error) {
        logger.error(MESSAGES.START_ERROR, error);
    }
}

run();