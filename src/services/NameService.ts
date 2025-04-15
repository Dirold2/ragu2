import {
    type CommandInteraction,
    type GuildMember,
} from "discord.js";
import { z } from "zod";
import {
    PluginNotFoundError,
    UserNotInVoiceChannelError,
} from "../errors/index.js";
import type { MusicServicePlugin } from "../interfaces/index.js";
import { trackPlayCounter } from "../utils/index.js";
import {
    type PlayerManager,
    type PluginManager,
    type SearchTrackResult,
    type Track,
} from "./index.js";
import { bot } from "../bot.js";

const TrackUrlSchema = z.string().url();

/**
 * Service for searching and processing music tracks
 * @en Handles track search, URL processing and playlist management
 * @ru Сервис для поиска и обработки музыкальных треков
 */
export default class NameService {
    /**
     * @en Creates a new instance of NameService
     * @ru Создает новый экземпляр NameService
     * @param queueService Queue service instance
     * @param playerManager Player manager instance
     * @param pluginManager Plugin manager instance
     */
    constructor(
        private readonly queueService = bot.queueService,
        private readonly playerManager: PlayerManager,
        private readonly pluginManager: PluginManager,
    ) {}

    private readonly logger = bot.logger;
    private readonly locale = bot.locale;

    /**
     * @en Searches for a track by name or processes URL
     * @ru Ищет трек по имени или обрабатывает URL
     * @param trackName Track name or URL to search
     * @returns Promise with search results
     */
    async searchName(trackName: string): Promise<SearchTrackResult[]> {
        this.logger.debug(
            this.locale.t("messages.nameService.info.searching_track", {
                query: trackName,
            }),
        );
        const trimmedName = trackName.trim();
        if (!trimmedName) return [];

        return TrackUrlSchema.safeParse(trimmedName).success
            ? this.searchAndProcessURL(trimmedName)
            : this.searchAcrossPlugins(trimmedName);
    }

    /**
     * @en Processes track URL and handles playlist detection
     * @ru Обрабатывает URL трека и определяет плейлисты
     * @param url Track URL to process
     * @param track Search results
     * @param interaction Command interaction
     */
    async trackAndUrl(
        url: string,
        track: SearchTrackResult[],
        interaction: CommandInteraction,
    ) {
        const plugin = bot.pluginManager.getPlugin(track[0].source);
        if (!plugin) {
            this.logger.error(
                this.locale.t("messages.nameService.errors.plugin_not_found", {
                    source: track[0].source,
                }),
            );
            return;
        }

        if (plugin.includesUrl) {
            const includesUrl = await plugin.includesUrl(url);
            if (includesUrl) {
                await this.processPlaylist(url, interaction);
            } else {
                await this.processTrackSelection(track[0], interaction);
            }
        } else {
            await this.processTrackSelection(track[0], interaction);
        }
    }

    /**
     * @en Processes selected track and adds it to queue
     * @ru Обрабатывает выбранный трек и добавляет его в очередь
     * @param selectedTrack Track to process
     * @param interaction Command interaction
     */
    async processTrackSelection(
        selectedTrack: SearchTrackResult,
        interaction: CommandInteraction,
    ): Promise<void> {
        try {
            const { guildId } = this.getVoiceChannelInfo(interaction);
            const track = this.createTrackInfo(selectedTrack, interaction, true);

            await this.addTrackToQueue(track, guildId, interaction);
            trackPlayCounter.inc({ status: "success" });
        } catch (error) {
            this.logger.error(
                this.locale.t("messages.nameService.errors.track_processing", {
                    error: error instanceof Error ? error.message : String(error),
                }),
                error,
            );
            await bot.commandService.reply(
                interaction,
                "messages.nameService.errors.track_processing",
                {
                    error: error instanceof Error ? error.message : String(error),
                }
            );
        }
    }

    /**
     * @en Adds track to playback queue
     * @ru Добавляет трек в очередь воспроизведения
     * @param track Track to add
     * @param guildId Guild ID
     * @param interaction Command interaction
     */
    private async addTrackToQueue(
        track: Track,
        guildId: string,
        interaction: CommandInteraction,
    ): Promise<void> {
        await bot.commandService.reply(
            interaction,
            "messages.nameService.success.added_to_queue", 
            {
                track: track.info,
            }
        );

        await Promise.all([
            this.playerManager.playOrQueueTrack(guildId, track) || null,
            this.playerManager.joinChannel(interaction) || null,
        ]);
    }

    /**
     * @en Processes playlist URL and adds tracks to queue
     * @ru Обрабатывает URL плейлиста и добавляет треки в очередь
     * @param url Playlist URL
     * @param interaction Command interaction
     */
    async processPlaylist(
        url: string,
        interaction: CommandInteraction,
    ): Promise<SearchTrackResult[] | void> {
        try {
            const { guildId } = this.getVoiceChannelInfo(interaction);
            const tracks = await this.searchAndProcessURL(url);

            if (!tracks.length) {
                throw new Error(
                    bot.locale.t("messages.nameService.errors.empty_playlist"),
                );
            }
            
            await bot.commandService.reply(
                interaction,
                "messages.nameService.success.playlist_added",
            );

            await this.addPlaylistTracksToQueue(
                tracks,
                guildId,
                interaction.user.id,
                interaction,
            );

            return tracks;
        } catch (error) {
            await this.handleError(error);
        }
    }


	/**
	 * Ищет трек во всех плагинах
	 */
	private async searchAcrossPlugins(
		trackName: string,
	): Promise<SearchTrackResult[]> {
		const results = await Promise.allSettled(
			this.pluginManager
				.getAllPlugins()
				.map((plugin) => this.searchWithPlugin(plugin, trackName)),
		);

		return results
			.filter(
				(result): result is PromiseFulfilledResult<SearchTrackResult[]> =>
					result.status === "fulfilled",
			)
			.flatMap((result) => result.value)
			.filter(Boolean);
	}

	/**
	 * Ищет трек с помощью определенного плагина
	 */
	private async searchWithPlugin(
		plugin: MusicServicePlugin,
		trackName: string,
	): Promise<SearchTrackResult[]> {
		try {
			return await plugin.searchName(trackName);
		} catch (error) {
			this.logger.warn(
				this.locale.t("messages.nameService.errors.search_error", {
					plugin: plugin.name,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	/**
	 * Ищет и обрабатывает URL
	 */
	private async searchAndProcessURL(url: string): Promise<SearchTrackResult[]> {
		const plugin = this.pluginManager.getPluginForUrl(url);
		if (!plugin) throw new PluginNotFoundError(url);

		try {
			const result = await plugin.searchURL(url);
			return Array.isArray(result) ? result : [];
		} catch (error) {
			this.logger.warn(
				this.locale.t("messages.nameService.errors.url_processing", {
					plugin: plugin.name,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return [];
		}
	}

	/**
	 * Добавляет треки плейлиста в очередь
	 */
	private async addPlaylistTracksToQueue(
		tracks: SearchTrackResult[],
		guildId: string,
		requestedBy?: string,
		interaction?: CommandInteraction,
	): Promise<void> {
		this.processPlaylistTrack(tracks, guildId, requestedBy);

		if (interaction) {
			await this.playerManager.joinChannel(interaction);
		}
	}

	/**
	 * Обрабатывает трек плейлиста и добавляет его в очередь
	 */
	private async processPlaylistTrack(
		tracks: SearchTrackResult[],
		guildId: string,
		requestedBy?: string,
	): Promise<void> {
		const plugin = this.pluginManager.getPlugin(tracks[0].source);
		if (!plugin?.getTrackUrl) return;

		const transformedTracks: Omit<Track, "id">[] = tracks.map((track) => {
			return {
				trackId: track.id,
				info: this.formatTrackInfo(track) || "Unknown Track",
				source: track.source || "unknown",
				priority: false,
				...(requestedBy && { requestedBy }),
			};
		});

		await this.queueService.setTracks(guildId, transformedTracks);
	}

	/**
	 * Форматирует информацию о треке
	 */
	private formatTrackInfo(track: SearchTrackResult): string {
		return `${track.artists.map((a) => a.name).join(", ")} - ${track.title}`;
	}

    /**
     * @en Gets voice channel info from interaction
     * @ru Получает информацию о голосовом канале из взаимодействия
     * @param interaction Command interaction
     * @throws UserNotInVoiceChannelError
     * @returns Channel and guild IDs
     */
    private getVoiceChannelInfo(interaction: CommandInteraction): {
        channelId: string;
        guildId: string;
    } {
        const member = interaction.member as GuildMember;
        const channelId = member.voice?.channelId;
        const guildId = member.guild?.id;

        if (!channelId || !guildId) {
            throw new UserNotInVoiceChannelError();
        }

        return { channelId, guildId };
    }

    /**
     * @en Creates track info object
     * @ru Создает объект с информацией о треке
     * @param track Source track data
     * @param interaction Command interaction
     * @param isPriority Priority flag
     * @returns Track info object
     */
    private createTrackInfo(
        track: SearchTrackResult,
        interaction: CommandInteraction,
        isPriority = false,
    ): Track {
        return {
            trackId: track.id,
            info: this.formatTrackInfo(track),
            source: track.source,
            priority: isPriority,
            requestedBy: interaction.user.id,
        };
    }

    /**
     * @en Handles errors and logs them
     * @ru Обрабатывает и логирует ошибки
     * @param error Error object
     */
    private async handleError(error: unknown): Promise<void> {
        bot.logger.error(
            bot.locale.t("messages.nameService.errors.track_processing", {
                error: error instanceof Error ? error.message : String(error),
            }),
            error,
        );
    }
}
