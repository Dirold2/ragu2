import { Discord } from "discordx";
import { CommandInteraction, GuildMember, PermissionFlagsBits, VoiceChannel } from "discord.js";
import { 
    AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, 
    DiscordGatewayAdapterCreator, entersState, getVoiceConnection, joinVoiceChannel, 
    StreamType, VoiceConnection, VoiceConnectionStatus, AudioResource, 
    NoSubscriberBehavior 
} from "@discordjs/voice";

import { bot } from "../bot.js";
import logger from "../utils/logger.js";
import { QueueService, CommandService, Track } from "./index.js";

const RECONNECTION_TIMEOUT = 5000;
const EMPTY_CHANNEL_CHECK_INTERVAL = 30000;

@Discord()
export default class PlayerService {
    private player: AudioPlayer;
    private connection: VoiceConnection | null = null;
    public channelId: string | null = null;
    public volume = 15;
    private currentTrack: Track | null = null;
    private nextTrack: Track | null = null;
    private isConnecting = false;
    private emptyChannelCheckInterval: NodeJS.Timeout | null = null;

    constructor(
        private queueService: QueueService,
        private commandService: CommandService,
        public guildId: string
    ) {
        this.player = this.createPlayer();
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
            if (!this.nextTrack) await this.loadNextTrack();
        } catch (error) {
            logger.error(`Failed to play or queue track: ${error.message}`, error);
        }
    }

    private async play(track: Track): Promise<void> {
        const resource = await this.createAudioResource(track);
        this.player.play(resource);
        logger.info(`Playing track: ${track.info}`);
        await bot.client.user?.setActivity(track.info, {type: 3});
    }

    private createAudioResource(track: Track): Promise<AudioResource> {
        return new Promise((resolve, reject) => {
            const resource = createAudioResource(track.url, { 
                inputType: StreamType.Arbitrary, 
                inlineVolume: true 
            });
            
            resource.volume?.setVolumeLogarithmic(this.volume / 100);
            
            resource.playStream
                .on('error', error => {
                    logger.error(`Error in audio stream: ${error.message}`, error);
                    reject(error);
                })
                .once('readable', () => resolve(resource));
        });
    }

    private async loadNextTrack(): Promise<void> {
        try {
            this.nextTrack = await this.queueService.getTrack(this.channelId);
            logger.verbose(this.nextTrack ? `Loaded next track: ${this.nextTrack.info}` : 'No next track to load');
        } catch (error) {
            logger.error(`Failed to load next track: ${error.message}`, error);
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
            (this.player.state.resource as AudioResource).volume?.setVolume(this.volume / 100);
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
            logger.error("Failed to join voice channel:", error);
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
            logger.error("Failed to connect to voice channel:", error);
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
            } catch {
                this.handleDisconnectionError();
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
            logger.error(`Failed to check empty channel: ${error.message}`, error);
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
            logger.error(`Error in audio player: ${error.message}`);
            this.handleTrackEnd();
        });

        player.on(AudioPlayerStatus.Idle, this.handleTrackEnd.bind(this));

        return player;
    }

    private async handleTrackEnd(): Promise<void> {
        logger.info(`Track ended: ${this.currentTrack?.info}`);
        await this.playNextTrack();
    }
}