import {
    CommandInteraction,
    GuildMember, 
    PermissionFlagsBits,
    VoiceChannel
} from "discord.js";
import { Discord } from "discordx";
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
    VoiceConnectionStatus
} from "@discordjs/voice";
import { Worker } from 'worker_threads';

import { bot } from "../bot.js";
import {
    DEFAULT_VOLUME,
    EMPTY_CHANNEL_CHECK_INTERVAL,
    RECONNECTION_TIMEOUT
} from "../config.js";
import logger from "../utils/logger.js";
import { CommandService, QueueService, Track } from "./index.js";

@Discord()
export default class PlayerService {
    // Приватные свойства
    private player: AudioPlayer;
    private connection: VoiceConnection | null = null;
    private isPlaying = false;
    private emptyChannelCheckInterval: NodeJS.Timeout | null = null;
    private resource: AudioResource | null = null;
    private fadeOutTimeout: NodeJS.Timeout | null = null;

    // Публичные свойства
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

    // Публичные методы управления воспроизведением
    public async playOrQueueTrack(track: Track): Promise<void> {
        try {
            const action = this.isPlaying ? this.queueTrack : this.playTrack;
            await action.call(this, track);
            if (!this.nextTrack) await this.loadNextTrack();
        } catch (error) {
            this.handleError(error as Error, "Failed to play or queue track");
        }
    }

    public async skip(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        // Затухание громкости на 3 секунды
        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.smoothVolumeChange(0, 1000, false);
        }

        // Скип трека через 2 секунды
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.playNextTrack();
        await this.commandService.send(
            interaction,
            `Skipped to next track: ${this.currentTrack?.info || "No track"}`
        );
    }

    public async togglePause(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        const status = this.player.state.status;
        const toggleActions: { [key: string]: () => void } = {
            [AudioPlayerStatus.Playing]: () => {
                this.player.pause();
                this.isPlaying = false;
                this.commandService.send(interaction, "Playback paused.");
            },
            [AudioPlayerStatus.Paused]: () => {
                this.player.unpause();
                this.isPlaying = true;
                this.commandService.send(interaction, "Playback resumed.");
            },
        };

        const action = toggleActions[status];
        if (action) {
            action();
        } else {
            this.commandService.send(interaction, "No track is currently playing.");
        }
    }

    // Методы управления длительностью и громкостью
    private async getTrackDuration(url: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const worker = new Worker('./src/workers/trackDurationWorker.js');
            worker.postMessage(url);
    
            worker.on('message', (message) => {
                if (typeof message === 'number') {
                    resolve(message);
                } else if (message.error) {
                    reject(new Error(message.error));
                }
            });
    
            worker.on('error', (error) => {
                reject(error);
            });
    
            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });
    }

    public setVolume(volume: number): void {
        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.smoothVolumeChange(volume / 100, 2000);
        }
    }

    // Методы управления подключением
    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        const member = interaction.member as GuildMember;
        const voiceChannelId = member.voice.channel?.id;

        if (!this.hasVoiceChannelAccess(member) || !voiceChannelId) {
            await this.commandService.send(
                interaction,
                "No access to voice channel or invalid channel ID."
            );
            return;
        }

        this.channelId = voiceChannelId;
        this.connection = getVoiceConnection(this.guildId) || 
            (await this.connectToChannel(voiceChannelId, interaction));

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

    // Методы управления громкостью
    public smoothVolumeChange(
        targetVolume: number,
        duration: number,
        memorize: boolean = true,
        zero: boolean = false,
    ): Promise<void> {
        return new Promise((resolve) => {
            var startVolume = 0;
            if (zero) {
                startVolume = 0;
            } else {
                startVolume = this.volume / 100 || 0;
            }
            
            logger.info(`start: ${startVolume} target: ${targetVolume} volume: ${this.volume / 100}`)

            const volumeDiff = targetVolume - startVolume;
            const steps = 20;
            const stepDuration = duration / steps;
            const volumeStep = volumeDiff / steps;

            if (memorize) {
                this.volume = targetVolume * 100;
            }
            let currentStep = 0;

            const changeStep = () => {
                currentStep++;
                const newVolume = startVolume + volumeStep * currentStep;

                this.resource?.volume?.setVolumeLogarithmic(
                    Math.max(0, Math.min(1, newVolume))
                );

                if (currentStep < steps) {
                    setTimeout(changeStep, stepDuration);
                } else {
                    resolve();
                }
            };

            changeStep();
        });
    }

    // Методы управления треками
    private async playTrack(track: Track): Promise<void> {
        try {
            this.currentTrack = track;
    
            const trackUrl = track.url;
            if (!trackUrl) {
                throw new Error("Track URL is undefined");
            }
    
            const resource = createAudioResource(trackUrl, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true,
            });
    
            this.resource = resource;

            resource.volume?.setVolumeLogarithmic(0);

            // Очистка предыдущего таймера
            if (this.fadeOutTimeout) {
                clearTimeout(this.fadeOutTimeout);
                this.fadeOutTimeout = null;
            }

            this.smoothVolumeChange(this.volume / 100, 3000, true, true);

            this.player.play(resource);

            this.isPlaying = true;
            logger.debug(`Playing track: ${track.info}`);
            bot.client.user?.setActivity(track.info, { type: 3 });

            const trackDuration = await this.getTrackDuration(trackUrl);
    
            const fadeOutStartTime = trackDuration - 8000;
            this.fadeOutTimeout = setTimeout(() => {
                this.smoothVolumeChange(0, 6000, false);
            }, fadeOutStartTime);
    
        } catch (error) {
            this.handleError(error as Error, "Failed to play track");
        }
    }    

    private async queueTrack(track: Track): Promise<void> {
        if (!this.channelId) {
            logger.warn("Channel ID is null or undefined. Skipping track addition.");
            return;
        }

        try {
            await this.queueService.setTrack(this.channelId, this.guildId, track);
            logger.debug(`Track added to queue: ${track.info}`);
        } catch (error) {
            this.handleError(error as Error, "Failed to queue track");
        }
    }

    private async loadNextTrack(): Promise<void> {
        try {
            if (this.channelId) {
                this.nextTrack = await this.queueService.getTrack(this.channelId);
            } else {
                logger.warn(
                    "Channel ID is null or undefined. Skipping track addition."
                );
            }

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
            await this.playTrack(this.nextTrack);
            this.nextTrack = null;
            await this.loadNextTrack();
        } else {
            this.resetState();
            bot.client.user?.setActivity();
            logger.debug("Queue is empty, playback stopped.");
        }
    }

    // Вспомогательные методы подключения
    private async connectToChannel(
        channelId: string,
        interaction: CommandInteraction
    ): Promise<VoiceConnection> {
        const connection = joinVoiceChannel({
            channelId,
            guildId: this.guildId,
            adapterCreator: interaction.guild
                ?.voiceAdapterCreator as DiscordGatewayAdapterCreator,
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
                    entersState(
                        this.connection!,
                        VoiceConnectionStatus.Signalling,
                        RECONNECTION_TIMEOUT
                    ),
                    entersState(
                        this.connection!,
                        VoiceConnectionStatus.Connecting,
                        RECONNECTION_TIMEOUT
                    ),
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

    // Методы проверки пустого канала
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
            const channel = (await guild.channels.fetch(
                this.channelId
            )) as VoiceChannel;

            const nonBotMembers = channel.members.filter(
                (member) => !member.user.bot
            );

            if (nonBotMembers.size === 0) {
                logger.debug("No members in voice channel, disconnecting.");
                this.leaveChannel();
            }
        } catch (error) {
            this.handleError(error as Error, "Error checking empty channel");
        }
    }

    // Вспомогательные методы
    private ensureConnected(interaction: CommandInteraction): boolean {
        if (!this.connection) {
            this.commandService.send(
                interaction,
                "Not connected to a voice channel."
            );
            return false;
        }
        return true;
    }

    private hasVoiceChannelAccess(member: GuildMember): boolean {
        return (
            member.voice.channel
                ?.permissionsFor(member)
                ?.has(PermissionFlagsBits.Connect) ?? false
        );
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
        logger.debug(`Stack trace: ${error.stack}`);
    }

    private resetState(): void {
        this.connection = null;
        this.currentTrack = null;
        this.nextTrack = null;
        this.isPlaying = false;
        this.stopEmptyChannelCheck();
    }
}