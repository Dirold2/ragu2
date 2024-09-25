import { Discord, Slash, SlashOption } from "discordx";
import { ApplicationCommandOptionType, TextChannel, AutocompleteInteraction, CommandInteraction } from "discord.js";
import { bot } from "../bot.js";
import logger from '../utils/logger.js';

interface SearchResultItem {
    title: string;
    artists: { name: string }[];
}

interface SearchableTrack extends SearchResultItem {
    id: string;
    source: string;
    albums?: { title?: string }[];
}

@Discord()
export class PlayCommands {
    private searchCache: Map<string, SearchableTrack[]> = new Map();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

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

        const cacheKey = trimmedTrackName.toLowerCase();

        if (interaction instanceof AutocompleteInteraction) {
            await this.handleAutocompleteInteraction(interaction, trimmedTrackName, cacheKey);
        } else {
            await this.handleCommandInteraction(interaction as CommandInteraction, trimmedTrackName, cacheKey);
        }
    }

    private async handleAutocompleteInteraction(interaction: AutocompleteInteraction, trackName: string, cacheKey: string) {
        this.clearDebounceTimer(cacheKey);

        this.debounceTimers.set(cacheKey, setTimeout(async () => {
            try {
                const searchResults = await this.getSearchResults(cacheKey, trackName);
                await this.respondToAutocomplete(interaction, searchResults, trackName);
            } catch (error) {
                logger.error('Error in autocomplete:', error);
            }
        }, 300));
    }

    private async handleCommandInteraction(interaction: CommandInteraction, trackName: string, cacheKey: string) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const searchResults = await this.getSearchResults(cacheKey, trackName);
            if (!searchResults.length) {
                return this.safeReply(interaction, `No tracks found for "${trackName}". Please try a different search term.`);
            }

            const firstTrack = searchResults[0];
            if (interaction.channel instanceof TextChannel) {
                await bot.nameService.processTrackSelection(firstTrack, interaction);
            } else {
                await this.safeReply(interaction, "Error: This action can only be performed in a text channel.");
            }
        } catch (error) {
            logger.error('Error in play command:', error);
            await this.safeReply(interaction, "An error occurred while processing your request. Please try again later.");
        }
    }

    private async getSearchResults(cacheKey: string, trackName: string): Promise<SearchableTrack[]> {
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey)!;
        }

        const searchResults = await bot.nameService.searchName(trackName);
        this.searchCache.set(cacheKey, searchResults);
        setTimeout(() => this.searchCache.delete(cacheKey), 5 * 60 * 1000);
        return searchResults;
    }

    private async respondToAutocomplete(interaction: AutocompleteInteraction, searchResults: SearchableTrack[], trackName: string) {
        const filtered = searchResults
            .filter(track => track.title.toLowerCase().includes(trackName.toLowerCase()))
            .slice(0, 25)
            .map(track => ({
                name: `${track.artists.map(artist => artist.name).slice(0, 3).join(', ')} - ${track.title.slice(0, 50)}`,
                value: `${track.artists.map(artist => artist.name).slice(0, 3).join(', ')} - ${track.title.slice(0, 50)}`
            }));

        await interaction.respond(filtered).catch(error => {
            logger.error('Error responding to autocomplete:', error);
        });
    }

    private async safeReply(interaction: CommandInteraction, content: string) {
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(content);
            } else {
                await interaction.reply({ content, ephemeral: true });
            }
        } catch (error) {
            logger.error('Error replying to interaction:', error);
        }
    }

    private clearDebounceTimer(cacheKey: string) {
        const timer = this.debounceTimers.get(cacheKey);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(cacheKey);
        }
    }
}
