import { Client } from 'discord.js';
import { logger } from '../utils/index.js';
import { On } from "discordx";

export const handleEnd = async (client: Client) => {
    On()
    client.on('ready', () => {
        logger.info(`Logged in as ${client.user?.tag}!`);
        client.destroy();
    });
};