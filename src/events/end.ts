import { Client } from 'discord.js';
import { On } from 'discordx';

import { logger } from '../utils/index.js';

export const handleEnd = async (client: Client) => {
    On()
    client.on('ready', () => {
        logger.info(`Logged in as ${client.user?.tag}!`);
        client.destroy();
    });
};