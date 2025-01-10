import { dirname } from "dirname-filename-esm";
import { CommandInteraction, GuildMember, PermissionFlagsBits, VoiceChannel } from "discord.js";
import { Discord } from "discordx";
import path from "path";
import { Worker } from "worker_threads";
import {
    AudioPlayer,
    AudioPlayerStatus,
    AudioResource,
    createAudioPlayer,
    createAudioResource,
    DiscordGatewayAdapterCreator,
    entersState,
    getVoiceConnection,
    joinVoiceChannel,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnection,
    VoiceConnectionStatus,
} from "@discordjs/voice";

import { bot } from "../bot.js";
import { DEFAULT_VOLUME, EMPTY_CHANNEL_CHECK_INTERVAL, RECONNECTION_TIMEOUT } from "../config.js";
import logger from "../utils/logger.js";
import { CommandService, QueueService, Track } from "./index.js";

const __dirname = dirname(import.meta);

@Discord()
export default class PlayerService {
    public channelId: string | null = null;
    public volume = DEFAULT_VOLUME;
    public currentTrack: Track | null = null;
    private player: AudioPlayer;
    private connection: VoiceConnection | null = null;
    private nextTrack: Track | null = null;
    private isConnecting = false;
    private emptyChannelCheckInterval: NodeJS.Timeout | null = null;
    private audioWorker: Worker;
    private isPlaying = false;

    constructor(
        private queueService: QueueService,
        private commandService: CommandService,
        public guildId: string
    ) {
        this.player = this.createPlayer();
        this.audioWorker = new Worker(path.resolve(__dirname, "../workers/playerWorker.js"));
        this.audioWorker.on("message", this.handleWorkerMessage);
    }

    public async playOrQueueTrack(track: Track): Promise<void> {
        try {
            if (!this.isPlaying) {
                await this.playTrack(track);
            } else {
                await this.queueTrack(track);
            }

            if (!this.nextTrack) {
                await this.loadNextTrack();
            }
        } catch (error) {
            this.handleError(error as Error, "Failed to play or queue track");
        }
    }

    public async skip(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        await this.playNextTrack();
        await this.commandService.send(
            interaction,
            `Skipped to next track: ${this.currentTrack?.info || "No track"}`
        );
    }

    public async togglePause(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        const status = this.player.state.status;
        if (status === AudioPlayerStatus.Playing) {
            this.player.pause();
            this.isPlaying = false;
            await this.commandService.send(interaction, "Playback paused.");
        } else if (status === AudioPlayerStatus.Paused) {
            this.player.unpause();
            this.isPlaying = true;
            await this.commandService.send(interaction, "Playback resumed.");
        } else {
            await this.commandService.send(interaction, "No track is currently playing.");
        }
    }

    public setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(100, volume));
        if (this.player.state.status === AudioPlayerStatus.Playing) {
            (this.player.state.resource as AudioResource).volume?.setVolumeLogarithmic(this.volume / 100);
        }
    }

    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            const member = interaction.member as GuildMember;
            const voiceChannelId = member.voice.channel?.id;

            if (!this.hasVoiceChannelAccess(member) || !voiceChannelId) {
                await this.commandService.send(interaction, "No access to voice channel or invalid channel ID.");
                return;
            }

            this.channelId = voiceChannelId;
            this.connection = getVoiceConnection(this.guildId) || await this.connectToChannel(voiceChannelId, interaction);

            const track = await this.queueService.getTrack(voiceChannelId);
            if (track) await this.playOrQueueTrack(track);

            this.handleDisconnection();
            this.startEmptyChannelCheck();
        } catch (error) {
            this.handleError(error as Error, "Failed to join voice channel");
            await this.commandService.send(interaction, "Failed to join voice channel. Please try again later.");
        } finally {
            this.isConnecting = false;
        }
    }

    public leaveChannel(): void {
        if (this.connection) {
            this.connection.destroy();
            this.resetState();
            bot.client.user?.setActivity();
            logger.debug("Disconnected from voice channel.");
        }
    }

    public cleanup(): void {
        this.stopEmptyChannelCheck();
        if (this.audioWorker) {
            this.audioWorker.terminate();
        }
        this.leaveChannel();
    }

    private async playTrack(track: Track): Promise<void> {
        this.currentTrack = track;
        await this.play(track);
    }

    private async queueTrack(track: Track): Promise<void> {
        await this.queueService.setTrack(this.channelId, this.guildId, track);
        logger.debug(`Track added to queue: ${track.info}`);
    }

    private async play(track: Track): Promise<void> {
        if (this.isPlaying) {
            logger.warn("Attempted to play a track while another is already playing. Stopping current playback.");
            this.player.stop();
        }

        try {
            const resource = await this.createAudioResource(track);
            this.player.play(resource);
            this.isPlaying = true;
            logger.debug(`Playing track: ${track.info}`);
            await bot.client.user?.setActivity(track.info, { type: 3 });
        } catch (error) {
            this.handleError(error as Error, "Error playing track");
            await this.playNextTrack();
        }
    }

    private createAudioResource(track: Track): Promise<AudioResource> {
        return new Promise((resolve, reject) => {
            const handleMessage = (message: {
                type: string;
                resourceData?: { url: string };
                error?: string;
            }) => {
                if (message.type === "resourceCreated" && message.resourceData) {
                    this.audioWorker.off("message", handleMessage);
                    const resource = createAudioResource(message.resourceData.url, {
                        inputType: StreamType.Arbitrary,
                        inlineVolume: true,
                    });
                    resource.volume?.setVolumeLogarithmic(this.volume / 100);
                    resolve(resource);
                } else if (message.type === "error" && message.error) {
                    this.audioWorker.off("message", handleMessage);
                    reject(new Error(message.error));
                }
            };

            this.audioWorker.on("message", handleMessage);
            this.audioWorker.postMessage({
                type: "createAudioResource",
                url: track.url,
                volume: this.volume,
            });
        });
    }

    private handleWorkerMessage = (message: { type: string }): void => {
        if (message.type === "ready") {
            logger.debug("[worker]: Player is ready");
        }
    };

    private async loadNextTrack(): Promise<void> {
        try {
            this.nextTrack = await this.queueService.getTrack(this.channelId);
            logger.verbose(
                this.nextTrack
                    ? `Loaded next track: ${this.nextTrack.info}`
                    : "No next track to load"
            );
        } catch (error) {
            this.handleError(error as Error, "Failed to load next track");
        }
    }

    private async playNextTrack(): Promise<void> {
        if (this.nextTrack) {
            this.currentTrack = this.nextTrack;
            this.nextTrack = null;
            await this.play(this.currentTrack);
            await this.loadNextTrack();
        } else {
            this.resetState();
            await bot.client.user?.setActivity();
            logger.debug("Queue is empty, playback stopped.");
        }
    }

    private async connectToChannel(
        channelId: string,
        interaction: CommandInteraction
    ): Promise<VoiceConnection> {
        const connection = joinVoiceChannel({
            channelId,
            guildId: this.guildId,
            adapterCreator: interaction.guild?.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            selfDeaf: false,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30000);
            connection.subscribe(this.player);
            return connection;
        } catch (error) {
            connection.destroy();
            this.handleError(error as Error, "Failed to connect to voice channel");
            throw new Error(`Connection timeout: ${(error as Error).message}`);
        }
    }

    private handleDisconnection(): void {
        this.connection?.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection!, VoiceConnectionStatus.Signalling, RECONNECTION_TIMEOUT),
                    entersState(this.connection!, VoiceConnectionStatus.Connecting, RECONNECTION_TIMEOUT),
                ]);
                logger.debug("Connection restored.");
            } catch (error) {
                this.handleDisconnectionError();
                this.handleError(error as Error, "Failed to restore connection");
            }
        });
    }

    private handleDisconnectionError(): void {
        if (this.connection) {
            this.connection.removeAllListeners();
            this.connection.destroy();
        }
        this.resetState();
        bot.client.user?.setActivity();
        logger.debug("Connection terminated.");
    }

    private startEmptyChannelCheck(): void {
        this.stopEmptyChannelCheck();
        this.emptyChannelCheckInterval = setInterval(
            () => this.checkEmptyChannel(),
            EMPTY_CHANNEL_CHECK_INTERVAL
        );
    }

    private stopEmptyChannelCheck(): void {
        if (this.emptyChannelCheckInterval) {
            clearInterval(this.emptyChannelCheckInterval);
            this.emptyChannelCheckInterval = null;
        }
    }

    private async checkEmptyChannel(): Promise<void> {
        if (!this.connection || !this.channelId) return;

        try {
            const guild = await bot.client.guilds.fetch(this.guildId);
            const channel = (await guild.channels.fetch(this.channelId)) as VoiceChannel;

            if (channel.members.size === 0) {
                logger.debug("No members in voice channel, disconnecting.");
                this.leaveChannel();
            }
        } catch (error) {
            this.handleError(error as Error, "Error checking empty channel");
        }
    }

    private ensureConnected(interaction: CommandInteraction): boolean {
        if (!this.connection) {
            this.commandService.send(interaction, "Not connected to a voice channel.");
            return false;
        }
        return true;
    }

    private hasVoiceChannelAccess(member: GuildMember): boolean {
        const channel = member.voice.channel;
        return channel?.permissionsFor(member)?.has(PermissionFlagsBits.Connect) ?? false;
    }

    private createPlayer(): AudioPlayer {
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            },
        });

        player.on("error", (error) => {
            this.handleError(error as Error, "Error in audio player");
            this.handleTrackEnd();
        });

        player.on(AudioPlayerStatus.Idle, this.handleTrackEnd);

        return player;
    }

    private handleTrackEnd = async (): Promise<void> => {
        logger.debug(`Track ended: ${this.currentTrack?.info}`);
        this.isPlaying = false;
        this.currentTrack = null;
        await this.playNextTrack();
    };

    private handleError(error: Error, message: string): void {
        logger.error(`${message}: ${error.message}`);
        bot.client.user?.setActivity("Error", { type: 3 });
    }

    private resetState(): void {
        this.connection = null;
        this.currentTrack = null;
        this.nextTrack = null;
        this.isPlaying = false;
        this.stopEmptyChannelCheck();
    }
}