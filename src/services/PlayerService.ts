import { CommandInteraction, GuildMember, PermissionFlagsBits, VoiceChannel } from 'discord.js';
import { Discord } from 'discordx';

import {
    AudioPlayer, AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource,
    DiscordGatewayAdapterCreator, entersState, getVoiceConnection, joinVoiceChannel,
    NoSubscriberBehavior, StreamType, VoiceConnection, VoiceConnectionStatus
} from '@discordjs/voice';

import { bot } from '../bot.js';
import { DEFAULT_VOLUME, EMPTY_CHANNEL_CHECK_INTERVAL, RECONNECTION_TIMEOUT } from '../config.js';
import logger from '../utils/logger.js';
import { CommandService, QueueService, Track } from './index.js';

@Discord()
export default class PlayerService {
    private player: AudioPlayer;
    private connection: VoiceConnection | null = null;
    private isPlaying = false;
    private emptyChannelCheckInterval: NodeJS.Timeout | null = null;

    public channelId: string | null = null;
    public volume = DEFAULT_VOLUME;
    public currentTrack: Track | null = null;
    public nextTrack: Track | null = null;

    constructor(
        private queueService: QueueService,
        private commandService: CommandService,
        public guildId: string
    ) {
        this.player = this.createPlayer();
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
        await this.commandService.send(interaction, `Skipped to next track: ${this.currentTrack?.info || "No track"}`);
    }

    public async togglePause(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.player.pause();
            this.isPlaying = false;
            await this.commandService.send(interaction, "Playback paused.");
        } else if (this.player.state.status === AudioPlayerStatus.Paused) {
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
        this.leaveChannel();
    }

    private async playTrack(track: Track): Promise<void> {
        this.currentTrack = track;
        const resource = createAudioResource(track.url, { inputType: StreamType.Arbitrary, inlineVolume: true });
        resource.volume?.setVolumeLogarithmic(this.volume / 100);
        this.player.play(resource);
        this.isPlaying = true;
        logger.debug(`Playing track: ${track.info}`);
        await bot.client.user?.setActivity(track.info, { type: 3 });
    }

    private async queueTrack(track: Track): Promise<void> {
        if (this.channelId !== null && this.channelId !== undefined) {
            await this.queueService.setTrack(this.channelId, this.guildId, track);
        } else {
            logger.warn('Channel ID is null or undefined. Skipping track addition.');
        }
        logger.debug(`Track added to queue: ${track.info}`);
    }

    private async loadNextTrack(): Promise<void> {
        try {
            if (this.channelId !== null && this.channelId !== undefined) {
                this.nextTrack = await this.queueService.getTrack(this.channelId);
            } else {
                logger.warn('Channel ID is null or undefined. Skipping track addition.');
            }
            logger.verbose(this.nextTrack ? `Loaded next track: ${this.nextTrack.info}` : "No next track to load");
        } catch (error) {
            this.handleError(error as Error, "Failed to load next track");
        }
    }

    private async playNextTrack(): Promise<void> {
        if (this.nextTrack) {
            await this.playTrack(this.nextTrack);
            this.nextTrack = null;
            await this.loadNextTrack();
        } else {
            this.resetState();
            await bot.client.user?.setActivity();
            logger.debug("Queue is empty, playback stopped.");
        }
    }

    private async connectToChannel(channelId: string, interaction: CommandInteraction): Promise<VoiceConnection> {
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
                logger.error("Connection terminated", error);
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
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
        });

        player.on("error", (error) => {
            this.handleError(error, "Error in audio player");
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
    }

    private resetState(): void {
        this.connection = null;
        this.currentTrack = null;
        this.nextTrack = null;
        this.isPlaying = false;
        this.stopEmptyChannelCheck();
    }
}