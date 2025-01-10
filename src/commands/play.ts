import {
    ApplicationCommandOptionType, AutocompleteInteraction, CommandInteraction,
    InteractionReplyOptions, TextChannel
} from 'discord.js';
import { Discord, Slash, SlashOption } from 'discordx';

import { bot } from '../bot.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import Bottleneck from "bottleneck";

interface Artist {
    name: string;
}

interface Album {
    title?: string;
}

interface SearchableTrack {
    id: string;
    title: string;
    artists: Artist[];
    source: string;
    albums?: Album[];
}

type CacheKey = string;

@Discord()
export class PlayCommands {
    private static readonly CACHE_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutes
    // private static readonly DEBOUNCE_DELAY = 300; // 300 ms
    private static readonly MAX_AUTOCOMPLETE_RESULTS = 25;
    private static readonly MAX_ARTIST_DISPLAY = 3;
    private static readonly MAX_TITLE_LENGTH = 50;
    private static readonly MAX_CACHE_SIZE = 100; // Limit cache size
    private static readonly MAX_TRACK_NAME_LENGTH = 200; // Limit track name length

    private static readonly rateLimiter = new Bottleneck({ maxConcurrent: 1, minTime: 1000 });

    private searchCache: Map<CacheKey, SearchableTrack[]> = new Map();
    private debounceTimers: Map<CacheKey, NodeJS.Timeout> = new Map();

    @Slash({ description: "Play a track", name: "play" })
    async play(
        @SlashOption({
            description: "Track name or URL",
            name: "track",
            required: true,
            type: ApplicationCommandOptionType.String,
            autocomplete: true
        })
        trackName: string,
        interaction: CommandInteraction | AutocompleteInteraction
    ): Promise<void> {
        const trimmedTrackName = trackName.trim();

        if (!trimmedTrackName || trimmedTrackName.length > PlayCommands.MAX_TRACK_NAME_LENGTH) {
            if (interaction.isChatInputCommand()) {
                await this.safeReply(interaction, "Track name is too long. Please use a shorter query.");
            }
            return;
        }

        const cacheKey = this.generateCacheKey(trimmedTrackName);

        if (interaction.isAutocomplete()) {
            await this.handleAutocompleteInteraction(interaction, trimmedTrackName, cacheKey);
        } else if (interaction.isChatInputCommand()) {
            await this.handleCommandInteraction(interaction, trimmedTrackName, cacheKey);
        } else {
            logger.warn('Unexpected interaction type');
            if (interaction instanceof CommandInteraction) {
                await this.safeReply(interaction, "Unexpected interaction type. Please try again.");
            }
        }
    }

    private async handleAutocompleteInteraction(
        interaction: AutocompleteInteraction,
        trackName: string,
        cacheKey: CacheKey
    ): Promise<void> {
        this.clearDebounceTimer(cacheKey);

        try {
            const searchResults = await this.getSearchResults(cacheKey, trackName);
            await this.respondToAutocomplete(interaction, searchResults, trackName);
        } catch (error) {
            logger.error('Error in autocomplete:', error);
        }
    }

    private async handleCommandInteraction(
        interaction: CommandInteraction,
        trackName: string,
        cacheKey: CacheKey
    ): Promise<void> {
        try {
            await interaction.deferReply({ ephemeral: true });

            const searchResults = await this.getSearchResults(cacheKey, trackName);
            if (!searchResults.length) {
                logger.warn(`No tracks found for search term "${trackName}"`);
                return this.safeReply(interaction, `No tracks found for "${trackName}". Please try a different search term.`);
            }

            const firstTrack = searchResults[0];
            logger.debug(`Selected track: ${firstTrack.title} by ${firstTrack.artists.map(a => a.name).join(', ')}`);

            if (interaction.channel instanceof TextChannel) {
                try {
                    await bot.nameService.processTrackSelection(firstTrack, interaction);
                } catch (error) {
                    logger.error('Error processing track selection:', error);
                    await this.safeReply(interaction, "Failed to process the selected track. Please try again later.");
                }
            } else {
                await this.safeReply(interaction, "Error: This action can only be performed in a text channel.");
            }
        } catch (error) {
            logger.error('Error in play command:', error);
            await this.safeReply(interaction, "An error occurred while processing your request. Please try again later.");
        }
    }

    private async getSearchResults(cacheKey: CacheKey, trackName: string): Promise<SearchableTrack[]> {
        if (this.searchCache.has(cacheKey)) {
            const cachedResults = this.searchCache.get(cacheKey) ?? [];
            logger.info(`Found ${cachedResults.length} cached results for "${trackName}"`);
            return cachedResults;
        }

        logger.debug(`Fetching new results for "${trackName}"`);
        return await PlayCommands.rateLimiter.schedule(async () => {
            try {
                const searchResults = await bot.nameService.searchName(trackName);
                if (!searchResults || searchResults.length === 0) {
                    logger.warn(`No results returned from searchName for "${trackName}"`);
                    return [];
                }

                this.searchCache.set(cacheKey, searchResults);
                setTimeout(() => this.searchCache.delete(cacheKey), PlayCommands.CACHE_EXPIRATION_TIME);
                this.maintainCacheSize();

                logger.debug(`Fetched ${searchResults.length} results for "${trackName}"`);
                return searchResults;
            } catch (error) {
                logger.error(`Error fetching search results for "${trackName}":`, error);
                return [];
            }
        });
    }

    private async respondToAutocomplete(
        interaction: AutocompleteInteraction,
        searchResults: SearchableTrack[],
        trackName: string
    ): Promise<void> {
        const filtered = searchResults
            .filter(track =>
                track.title.toLowerCase().includes(trackName.toLowerCase()) ||
                track.artists.some(artist => artist.name.toLowerCase().includes(trackName.toLowerCase()))
            )
            .slice(0, PlayCommands.MAX_AUTOCOMPLETE_RESULTS)
            .map(track => ({
                name: this.formatTrackName(track),
                value: this.formatTrackName(track)
            }));

        try {
            await interaction.respond(filtered);
        } catch (error) {
            if (error.code === 10062) {
                logger.warn('Interaction expired, skipping response');
            } else {
                logger.error('Error responding to autocomplete:', error);
            }
        }
    }

    private formatTrackName(track: SearchableTrack): string {
        const artists = track.artists
            .map(artist => artist.name)
            .slice(0, PlayCommands.MAX_ARTIST_DISPLAY)
            .join(', ');

        const title = track.title.length > PlayCommands.MAX_TITLE_LENGTH
            ? `${track.title.slice(0, PlayCommands.MAX_TITLE_LENGTH - 3)}...`
            : track.title;

        return `${artists} - ${title}`;
    }

    private async safeReply(interaction: CommandInteraction, content: string): Promise<void> {
        const replyOptions: InteractionReplyOptions = { content, ephemeral: true };
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(replyOptions);
            } else {
                await interaction.reply(replyOptions);
            }
        } catch (error) {
            logger.error('Error replying to interaction:', error);
        }
    }

    private clearDebounceTimer(cacheKey: CacheKey): void {
        const timer = this.debounceTimers.get(cacheKey);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(cacheKey);
        }
    }

    private maintainCacheSize(): void {
        if (this.searchCache.size > PlayCommands.MAX_CACHE_SIZE) {
            const keys = Array.from(this.searchCache.keys());
            this.searchCache.delete(keys[0]);
        }
    }

    private generateCacheKey(input: string): CacheKey {
        return crypto.createHash('md5').update(input.trim().toLowerCase()).digest('hex');
    }
}