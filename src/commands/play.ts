import { 
    ApplicationCommandOptionType, 
    AutocompleteInteraction, 
    CommandInteraction,
    // TextChannel 
  } from 'discord.js';
import { Discord, Slash, SlashOption } from 'discordx';
import { bot } from '../bot.js';
import logger from '../utils/logger.js';

interface Track {
    id: string;
    title: string;
    artists: { name: string }[];
    source: string;
    albums?: { title?: string }[];
}

@Discord()
export class PlayCommand {
    private static readonly MAX_RESULTS = 25;
    private static readonly MAX_TITLE_LENGTH = 50;

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
        const query = trackName.trim();

        if (!query) {
            if (interaction.isChatInputCommand()) {
                await bot.commandService.reply(interaction, "Please provide a track name or URL");
            }
            return;
        }

        if (interaction.isAutocomplete()) {
            await this.handleAutocomplete(interaction, query);
        } else if (interaction.isChatInputCommand()) {
            await this.handlePlay(interaction, query);
        }
    }

    private async handleAutocomplete(
        interaction: AutocompleteInteraction, 
        query: string
    ): Promise<void> {
        try {
            if (query.length < 2) {
                await interaction.respond([]);
                return;
            }

            const results = await bot.nameService.searchName(query);
            const choices = results
                .slice(0, PlayCommand.MAX_RESULTS)
                .map(track => {
                    const formattedName = this.formatTrackName(track);
                    const validName = this.truncateString(formattedName, 100);
                    return {
                        name: validName,
                        value: validName,
                        artistMatch: track.artists.some(artist => 
                            artist.name.toLowerCase().includes(query.toLowerCase())
                        ),
                        titleMatch: track.title.toLowerCase().includes(query.toLowerCase())
                    };
                })
                .filter(choice => 
                    choice.artistMatch || choice.titleMatch
                )
                .sort((a, b) => {
                    if (a.artistMatch && !b.artistMatch) return -1;
                    if (!a.artistMatch && b.artistMatch) return 1;
                    if (a.titleMatch && !b.titleMatch) return -1;
                    if (!a.titleMatch && b.titleMatch) return 1;
                    return 0;
                })
                .map(({ name, value }) => ({ name, value }));

            await interaction.respond(choices);
        } catch (error) {
            logger.error('Ошибка автодополнения:', error);
            await interaction.respond([]);
        }
    }

    private truncateString(str: string, maxLength: number): string {
        return str.length > maxLength ? `${str.slice(0, maxLength - 3)}...` : str;
    }

    private async handlePlay(
        interaction: CommandInteraction,
        query: string
    ): Promise<void> {
        try {
            await interaction.deferReply({ ephemeral: true });

            const results = await bot.nameService.searchName(query);
            if (!results.length) {
                return bot.commandService.reply(interaction, `No tracks found for "${query}"`);
            }

            await bot.nameService.processTrackSelection(results[0], interaction);
        } catch (error) {
            logger.error('Play command error:', error);
            await bot.commandService.reply(interaction, "Failed to play track. Please try again");
        }
    }

    private formatTrackName(track: Track): string {
        const artists = track.artists.map(a => a.name).join(', ');
        const title = track.title.length > PlayCommand.MAX_TITLE_LENGTH
            ? `${track.title.slice(0, PlayCommand.MAX_TITLE_LENGTH)}...`
            : track.title;

        return `${artists} - ${title}`;
    }
}  