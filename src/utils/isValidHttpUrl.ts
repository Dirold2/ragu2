import logger from './logger.js';

export function isValidHttpUrl(string: string): boolean {
    let url;

    try {
        url = new URL(string);
    } catch (error) {
        logger.error('Error parsing URL:', error);
        return false;
    }

    return url.protocol === "http:" || url.protocol === "https:";
}