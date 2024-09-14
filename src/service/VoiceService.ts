import {
    joinVoiceChannel,
    createAudioResource,
    createAudioPlayer,
    VoiceConnection,
    AudioPlayer,
    entersState,
    VoiceConnectionStatus,
    DiscordGatewayAdapterCreator,
    AudioPlayerStatus,
} from "@discordjs/voice";

import { CommandInteraction, GuildMember, PermissionFlagsBits } from "discord.js";
import { QueueService, CommandService } from "../service/index.js";
import { Track } from "./QueueService.js";
import { YMApiService } from "./YMApiService.js";
import { ILogObj, Logger } from "tslog";

/**
 * Manages voice channel operations, such as connecting, playing, and queue management, for Discord bots.
 */
export class VoiceService {
    private player: AudioPlayer;
    private connection: VoiceConnection | null = null;
    private readonly commandService: CommandService;
    private readonly apiService: YMApiService;
    private readonly logger: Logger<ILogObj>;

    /**
     * @param {QueueService} queueService - Service to manage the queue of tracks.
     */
    constructor(private queueService: QueueService) {
        this.player = createAudioPlayer();
        this.commandService = new CommandService();
        this.apiService = new YMApiService();
        this.logger = new Logger();
        this.setupPlayerEvents();
    }

    /**
     * Set up event listeners for the audio player to handle track state changes.
     * @private
     */
    private setupPlayerEvents(): void {
        this.player.on("stateChange", async (oldState, newState) => {
            if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
                await this.handleTrackEnd();
            }
        });
    }

    /**
     * Handles the end of the current track, playing the next track in the queue if available, or retrieving a similar track if the queue is empty.
     * @returns {Promise<void>}
     */
    public async handleTrackEnd(): Promise<void> {
        const channelId = this.connection?.joinConfig.channelId;
        if (!channelId) return;

        const nextTrack = await this.queueService.getNextTrack(channelId);
        if (nextTrack) {
            await this.playNextTrack(nextTrack);
        } else if (await this.queueService.getWaveStatus(channelId) === true) {
            const similarTrack = await this.apiService.getSimilarTrack(channelId, this.queueService);
            await this.playNextTrack(similarTrack);
            await this.queueService.setLastTrackID(channelId, Number(similarTrack.id));
        } else {
            this.logger.info("Queue is empty, playback stopped.");
        }
    }

    /**
     * Checks if a member has access to a voice channel.
     * @param {GuildMember} member - The guild member to check.
     * @returns {boolean} True if the member has necessary permissions, false otherwise.
     * @private
     */
    private hasVoiceChannelAccess(member: GuildMember): boolean {
        const voiceChannel = member.voice.channel;
        return !!voiceChannel && ((voiceChannel.permissionsFor(member)?.has(PermissionFlagsBits.Connect) ?? false));
    }

    /**
     * Checks if the bot is currently connected to a voice channel.
     * @param {CommandInteraction} interaction - The interaction to check.
     * @returns {boolean} True if connected, false otherwise.
     */
    public isChannel(interaction: CommandInteraction): boolean {
        const member = interaction.member as GuildMember;
        return !!this.connection && !!member.voice.channel;
    }

    /**
     * Checks if the bot is connected to any voice channel.
     * @returns {boolean} True if connected, false otherwise.
     */
    public isConnected(): boolean {
        return !!this.connection;
    }

    /**
     * Checks if the player is currently playing a track.
     * @returns {boolean} True if playing, false otherwise.
     */
    public isPlaying(): boolean {
        return this.player.state.status === AudioPlayerStatus.Playing;
    }

    /**
     * Checks if the player is currently paused.
     * @returns {boolean} True if paused, false otherwise.
     */
    public isPaused(): boolean {
        return this.player.state.status === AudioPlayerStatus.Paused;
    }

    /**
     * Stops the audio player and logs the action.
     */
    public stopPlayer(): void {
        if (this.isPlaying()) {
            this.player.stop(true);
            this.logger.info("Player stopped.");
        } else {
            this.logger.info("Player is already stopped.");
        }
    }

    /**
     * Pauses the audio playback, if currently playing.
     */
    public pause(): void {
        if (this.isPlaying()) {
            this.player.pause();
            this.logger.info("Playback paused.");
        } else {
            this.logger.info("Nothing to pause, player is not playing a track.");
        }
    }

    /**
     * Resumes the audio playback, if currently paused.
     */
    public unpause(): void {
        if (this.isPaused()) {
            this.player.unpause();
            this.logger.info("Playback resumed.");
        } else {
            this.logger.info("Player is not in a paused state.");
        }
    }

    /**
     * Plays the next track in the queue, or logs an error if something goes wrong.
     * @param {Track} track - The track to play.
     * @returns {Promise<void>}
     * @private
     */
    private async playNextTrack(track: Track): Promise<void> {
        try {
            const resource = createAudioResource(track.url, { inlineVolume: true });
            resource.volume?.setVolume(0.03);
            this.player.play(resource);
            this.logger.info(`Playing track: ${track.info}`);
        } catch (error) {
            this.logger.error(`Playback error: ${(error as Error).message}`);
            this.player.stop(true);
        }
    }

    /**
     * Joins a voice channel and adds a track to the queue.
     * @param {CommandInteraction} interaction - The interaction that triggered the joining.
     * @returns {Promise<void>}
     */
    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        try {
            const member = interaction.member as GuildMember;

            if (!this.hasVoiceChannelAccess(member)) {
                await this.commandService.sendReply(interaction, "No access to voice channel.");
                return;
            }

            const voiceChannelId = member.voice.channel?.id;
            const guildId = interaction.guild?.id;

            if (!guildId || !voiceChannelId) {
                throw new Error("Guild ID or Voice Channel ID not found.");
            }

            await this.connectToChannel(guildId, voiceChannelId, interaction);
        } catch (error) {
            this.logger.error("Error connecting to channel:", error);
            await this.commandService.sendReply(interaction, "Failed to connect to voice channel.");
        }
    }

    /**
     * Connects to a voice channel and plays the next track if any.
     * @param {string} guildId - The ID of the guild.
     * @param {string} channelId - The ID of the voice channel.
     * @param {CommandInteraction} interaction - The interaction triggering the connection.
     * @returns {Promise<void>}
     * @private
     */
    private async connectToChannel(guildId: string, channelId: string, interaction: CommandInteraction): Promise<void> {
        if (this.connection && this.connection.joinConfig.channelId === channelId) {
            this.logger.info("Already connected to channel. Adding track...");
        } else {
            this.connection = joinVoiceChannel({
                channelId,
                guildId,
                adapterCreator: interaction.guild?.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            });

            await entersState(this.connection, VoiceConnectionStatus.Ready, 30000);
            this.connection.subscribe(this.player);

            this.logger.info("Successfully connected to channel.");
        }

        const nextTrack = await this.queueService.getNextTrack(channelId);
        if (nextTrack) {
            await this.addTrack(channelId, nextTrack);
        } else {
            this.logger.info("Queue is empty.");
        }

        this.handleDisconnection();
    }

    /**
     * Leaves the voice channel and clears the connection.
     * @returns {Promise<void>}
     */
    public async leaveChannel(): Promise<void> {
        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
            this.logger.info("Disconnected from voice channel.");
        }
    }

    /**
     * Clears the queue for a specific channel and stops the player.
     * @param {string} channelId - The ID of the voice channel.
     * @returns {Promise<void>}
     */
    public async clearQueue(channelId: string): Promise<void> {
        await this.queueService.clearQueue(channelId);
        this.player.stop(true);
        this.logger.info("Queue cleared and player stopped.");
    }

    /**
     * Handles unexpected disconnections and attempts to reconnect.
     * @private
     */
    private handleDisconnection(): void {
        if (this.connection) {
            this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(this.connection!, VoiceConnectionStatus.Signalling, 5000),
                        entersState(this.connection!, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                    this.logger.info("Connection restored.");
                } catch (error) {
                    this.logger.error("Error reconnecting:", (error as Error).message);
                    this.connection?.destroy();
                    this.connection = null;
                    this.logger.info("Connection terminated.");
                }
            });
        }
    }

    /**
     * Adds a new track to the queue, or starts playing it immediately if no track is currently playing.
     * @param {string} channelId - The ID of the voice channel.
     * @param {Track} track - The track to be added or played.
     * @returns {Promise<void>} A promise that resolves once the track is added or played.
     */
    public async addTrack(channelId: string, track: Track): Promise<void> {
        if (this.isPlaying()) {
            await this.queueService.addTrack(channelId, track);
            this.logger.info(`Track added to queue: ${track.info}`);
        } else {
            await this.playNextTrack(track);
        }
    }
}