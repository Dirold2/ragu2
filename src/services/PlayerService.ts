import { Discord } from "discordx";
import { CommandInteraction, GuildMember, PermissionFlagsBits, VoiceChannel } from "discord.js";
import {
    AudioPlayer, AudioPlayerStatus, createAudioPlayer,
    DiscordGatewayAdapterCreator, entersState, getVoiceConnection, joinVoiceChannel,
    VoiceConnection, VoiceConnectionStatus, AudioResource,
    NoSubscriberBehavior,
    createAudioResource,
    StreamType
} from "@discordjs/voice";

import { bot } from "../bot.js";
import logger from "../utils/logger.js";
import { QueueService, CommandService, Track } from "./index.js";
import { Worker } from "worker_threads";
import path from "path";
import { dirname } from 'dirname-filename-esm';
import { Readable } from "stream";
import { DEFAULT_VOLUME, EMPTY_CHANNEL_CHECK_INTERVAL, RECONNECTION_TIMEOUT } from "../config.js";

const __dirname = dirname(import.meta);

@Discord()
export default class PlayerService {
    private player: AudioPlayer;
    private connection: VoiceConnection | null = null;
    public channelId: string | null = null;
    public volume = DEFAULT_VOLUME;
    private currentTrack: Track | null = null;
    private nextTrack: Track | null = null;
    private isConnecting = false;
    private emptyChannelCheckInterval: NodeJS.Timeout | null = null;
    private audioWorker: Worker;
    
    constructor(
        private queueService: QueueService,
        private commandService: CommandService,
        public guildId: string
    ) {
        this.player = this.createPlayer();
        try {
            this.audioWorker = new Worker(path.resolve(__dirname, '../workers/playerWorker.js'));
            this.audioWorker.on('message', this.handleWorkerMessage.bind(this));
        } catch (error) {
            this.handleError(error as Error, 'Failed to initialize audio worker');
        }
    }

    public async playOrQueueTrack(track: Track): Promise<void> {
        try {
            if (!this.currentTrack) {
                this.currentTrack = track;
                await this.play(track);
            } else {
                await this.queueService.setTrack(this.channelId, this.guildId, track);
                logger.info(`Track added to queue: ${track.info}`);
            }

            if (!this.nextTrack) {
                await this.loadNextTrack();
            }
        } catch (error) {
            this.handleError(error as Error, 'Failed to play or queue track');
        }
    }

    private async play(track: Track): Promise<void> {
        try {
            const resource = await this.createAudioResource(track);
            this.player.play(resource);
            logger.info(`Playing track: ${track.info}`);
            await bot.client.user?.setActivity(track.info, { type: 3 });
        } catch (error) {
            this.handleError(error as Error, 'Error playing track');
        }
    }

    private createAudioResource(track: Track): Promise<AudioResource> {
        return new Promise((resolve, reject) => {
            const handleMessage = (message: { type: string; resourceData?: { url: string | Readable }; error?: string; }) => {
                if (message.type === 'resourceCreated' && message.resourceData) {
                    this.audioWorker.off('message', handleMessage);
                    const resource = createAudioResource(message.resourceData.url, {
                        inputType: StreamType.Arbitrary,
                        inlineVolume: true
                    });
                    resource.volume?.setVolumeLogarithmic(this.volume / 100);
                    resolve(resource);
                } else if (message.type === 'error' && message.error) {
                    this.audioWorker.off('message', handleMessage);
                    reject(new Error(message.error));
                }
            };

            this.audioWorker.on('message', handleMessage);
            this.audioWorker.postMessage({
                type: 'createAudioResource',
                url: track.url,
                volume: this.volume
            });
        });
    }
    
    private handleWorkerMessage(message: { type: string; }) {
        if (message.type === 'ready') {
          logger.info('[worker]: Player is ready');
        }
    }
    
    private async loadNextTrack(): Promise<void> {
        try {
            this.nextTrack = await this.queueService.getTrack(this.channelId);
            logger.verbose(this.nextTrack ? `Loaded next track: ${this.nextTrack.info}` : 'No next track to load');
        } catch (error) {
            this.handleError(error as Error, 'Failed to load next track');
        }
    }

    private async playNextTrack(): Promise<void> {
        if (this.nextTrack) {
            this.currentTrack = this.nextTrack;
            await this.play(this.currentTrack);
            await this.loadNextTrack();
        } else {
            this.currentTrack = this.nextTrack = null;
            await bot.client.user?.setActivity();
            logger.info("Queue is empty, playback stopped.");
        }
    }

    public async skip(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        await this.playNextTrack();
        await this.commandService.send(interaction, `Skipped to next track: ${this.currentTrack?.info || "No track"}`);
    }

    public async togglePause(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        const status = this.player.state.status;
        if (status === AudioPlayerStatus.Playing) {
            this.player.pause();
            await this.commandService.send(interaction, "Playback paused.");
        } else if (status === AudioPlayerStatus.Paused) {
            this.player.unpause();
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

            this.connection = getVoiceConnection(this.guildId) ||
                await this.connectToChannel(this.guildId, voiceChannelId, interaction);

            const track = await this.queueService.getTrack(voiceChannelId);
            if (track) await this.playOrQueueTrack(track);

            this.handleDisconnection();
            this.startEmptyChannelCheck();
        } catch (error) {
            this.handleError(error as Error, 'Failed to join voice channel');
            await this.commandService.send(interaction, "Failed to join voice channel. Please try again later.");
        } finally {
            this.isConnecting = false;
        }
    }

    public leaveChannel(): void {
        if (this.connection) {
            this.connection.destroy();
            this.currentTrack = this.nextTrack = null;
            this.stopEmptyChannelCheck();
            bot.client.user?.setActivity();
            logger.info("Disconnected from voice channel.");
        }
    }

    private async connectToChannel(guildId: string, channelId: string, interaction: CommandInteraction): Promise<VoiceConnection> {
        const connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: interaction.guild?.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            selfDeaf: false,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30000);
            connection.subscribe(this.player);
            return connection;
        } catch (error) {
            connection.destroy();
            this.handleError(error as Error, 'Failed to connect to voice channel');
            throw new Error(`Connection timeout: ${error.message}`);
        }
    }

    private handleDisconnection(): void {
        this.connection?.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection!, VoiceConnectionStatus.Signalling, RECONNECTION_TIMEOUT),
                    entersState(this.connection!, VoiceConnectionStatus.Connecting, RECONNECTION_TIMEOUT),
                ]);
                logger.info("Connection restored.");
            } catch (error) {
                this.handleDisconnectionError();
                this.handleError(error as Error, 'Failed to restore connection');
            }
        });
    }

    private handleDisconnectionError(): void {
        if (this.connection) {
            this.connection.removeAllListeners();
            this.connection.destroy();
        }
        this.connection = null;
        this.currentTrack = this.nextTrack = null;
        this.stopEmptyChannelCheck();
        bot.client.user?.setActivity();
        logger.info("Connection terminated.");
    }

    private startEmptyChannelCheck(): void {
        this.stopEmptyChannelCheck();
        this.emptyChannelCheckInterval = setInterval(() => this.checkEmptyChannel(), EMPTY_CHANNEL_CHECK_INTERVAL);
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
            const channel = await guild.channels.fetch(this.channelId) as VoiceChannel;
            
            if (channel instanceof VoiceChannel && channel.members.filter(member => !member.user.bot).size === 0) {
                logger.info("Voice channel is empty. Disconnecting.");
                this.leaveChannel();
            }
        } catch (error) {
            this.handleError(error as Error, 'Failed to check empty channel');
        }
    }

    private ensureConnected(interaction: CommandInteraction): boolean {
        const connection = getVoiceConnection(this.guildId);
        if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
            this.commandService.send(interaction, "Bot is not connected to a voice channel or the connection is not ready.");
            return false;
        }
        return true;
    }

    private hasVoiceChannelAccess(member: GuildMember): boolean {
        const permissions = member.voice.channel?.permissionsFor(member);
        return (permissions?.has(PermissionFlagsBits.Connect) && permissions?.has(PermissionFlagsBits.Speak)) ?? false;
    }

    private createPlayer(): AudioPlayer {
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            },
        });

        player.on('error', error => {
            this.handleError(error as Error, 'Error in audio player');
            this.handleTrackEnd();
        });

        player.on(AudioPlayerStatus.Idle, this.handleTrackEnd.bind(this));

        return player;
    }

    private async handleTrackEnd(): Promise<void> {
        logger.info(`Track ended: ${this.currentTrack?.info}`);
        await this.playNextTrack();
    }

    private handleError(error: Error, context: string): void {
        logger.error(`${context}: ${error.message}`, error);
    }

    public cleanup(): void {
        this.stopEmptyChannelCheck();
        if (this.audioWorker) {
            this.audioWorker.terminate();
        }
        this.leaveChannel();
    }
}