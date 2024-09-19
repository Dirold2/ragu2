import { Discord, Slash, SlashOption } from "discordx";
import { ApplicationCommandOptionType, TextChannel, AutocompleteInteraction, CommandInteraction } from "discord.js";
import { CommandService, NameService } from "../service/index.js";
import logger from '../utils/logger.js';

interface SearchResultItem {
    title: string;
    artists: { name: string }[];
}

interface SearchableTrack extends SearchResultItem {
    id: string;
    source: "yandex" | "youtube";
    albums?: { title?: string }[];
}

@Discord()
export class PlayCommands {
    private readonly nameService: NameService = new NameService();
    private readonly commandService: CommandService = new CommandService();
    private readonly logger = logger;

    private searchCache: Map<string, SearchableTrack[]> = new Map();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

    @Slash({ description: "Play a track", name: "play" })
    async play(
        @SlashOption({
            description: "Track name",
            name: "track",
            required: true,
            type: ApplicationCommandOptionType.String,
            autocomplete: true
        })
        trackName: string,
        interaction: CommandInteraction | AutocompleteInteraction
    ): Promise<void> {
        const cacheKey = trackName.toLowerCase();
        
        if (interaction instanceof AutocompleteInteraction) {
            this.handleAutocompleteInteraction(interaction, trackName, cacheKey);
            return;
        }

        this.handleCommandInteraction(interaction, trackName, cacheKey);
    }

    private async handleAutocompleteInteraction(interaction: AutocompleteInteraction, trackName: string, cacheKey: string) {
        if (this.debounceTimers.has(cacheKey)) {
            clearTimeout(this.debounceTimers.get(cacheKey)!);
        }

        this.debounceTimers.set(cacheKey, setTimeout(async () => {
            try {
                const searchResults = await this.getSearchResults(cacheKey, trackName);
                await this.respondToAutocomplete(interaction, searchResults, trackName);
            } catch (error) {
                this.logger.error('Error in autocomplete:', error);
                await this.commandService.send(interaction, "An error occurred while processing your request.");
            }
        }, 300));
    }

    private async handleCommandInteraction(interaction: CommandInteraction, trackName: string, cacheKey: string) {
        try {
            const searchResults = await this.getSearchResults(cacheKey, trackName);
            if (!searchResults.length) {
                await this.commandService.send(interaction, "Track not found!");
                return;
            }

            const firstTrack = searchResults[0];
            if (interaction.channel instanceof TextChannel) {
                await this.nameService.processTrackSelection(firstTrack, interaction);
            } else {
                await this.commandService.send(interaction, "Error: This action cannot be performed in this type of channel.");
            }
        } catch (error) {
            this.logger.error('Error in play command:', error);
            await this.commandService.send(interaction, "An error occurred while processing your request.");
        }
    }

    private async getSearchResults(cacheKey: string, trackName: string): Promise<SearchableTrack[]> {
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey)!;
        }
        const searchResults = await this.nameService.searchName(trackName);
        this.searchCache.set(cacheKey, searchResults);
        return searchResults;
    }

    private async respondToAutocomplete(interaction: AutocompleteInteraction, searchResults: SearchableTrack[], trackName: string) {
        const filtered = searchResults
            .filter(track => track.title.toLowerCase().includes(trackName.toLowerCase()))
            .map(track => {
                const truncatedArtists = track.artists.map(artist => artist.name).slice(0, 3).join(', ');
                const truncatedTitle = track.title.slice(0, 50); // Limit title length
                
                return {
                    name: truncatedArtists + ' - ' + truncatedTitle,
                    value: truncatedArtists + ' - ' + truncatedTitle
                };
            });
    
        await interaction.respond(filtered);
    }
}