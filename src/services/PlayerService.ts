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
    private player: AudioPlayer;
    private connection: VoiceConnection | null = null;
    private isPlaying = false;
    private emptyChannelCheckInterval: NodeJS.Timeout | null = null;
    private resource: AudioResource | null = null;
    private fadeOutTimeout: NodeJS.Timeout | null = null;

    public channelId: string | null = null;
    public volume = DEFAULT_VOLUME;
    public currentTrack: Track | null = null;
    public nextTrack: Track | null = null;
    public lastTrack: Track | null = null;
    public loop = false;

    constructor(
        private queueService: QueueService,
        private commandService: CommandService,
        public guildId: string
    ) {
        this.player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
        });
        this.setupPlayerEvents();
    }

    private setupPlayerEvents() {
        this.player.on("error", (error) => {
            logger.error(`Player error: ${error.message}`);
            this.handleTrackEnd();
        });
        this.player.on(AudioPlayerStatus.Idle, this.handleTrackEnd);
    }

    public async initializeLoop(): Promise<void> {
        this.loop = await this.queueService.getLoop(this.guildId);
    }

    public async playOrQueueTrack(track: Track): Promise<void> {
        try {
            this.isPlaying ? await this.queueTrack(track) : await this.playTrack(track);
            if (!this.nextTrack) await this.loadNextTrack();
        } catch (error) {
            logger.error(`Failed to play/queue track: ${error}`);
        }
    }

    public async skip(interaction: CommandInteraction): Promise<void> {
        if (!this.connection) {
            await this.commandService.send(interaction, "Not connected to voice");
            return;
        }

        if (this.player.state.status === AudioPlayerStatus.Playing) {
            await this.smoothVolumeChange(0, 1000, false);
        }

        this.lastTrack = this.currentTrack;
        await new Promise(r => setTimeout(r, 1000));
        await this.playNextTrack();
        await this.commandService.send(interaction, 
            `Skipped to: ${this.currentTrack?.info || "No track"}`);
    }

    public async togglePause(interaction: CommandInteraction): Promise<void> {
        if (!this.connection) return;

        const status = this.player.state.status;
        if (status === AudioPlayerStatus.Playing) {
            this.player.pause();
            this.isPlaying = false;
            await this.commandService.send(interaction, "Paused");
        } else if (status === AudioPlayerStatus.Paused) {
            this.player.unpause();
            this.isPlaying = true;
            await this.commandService.send(interaction, "Resumed");
        }
    }

    public setVolume(volume: number): void {
        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.smoothVolumeChange(volume / 100, 2000);
        }
    }

    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        const member = interaction.member as GuildMember;
        const voiceChannelId = member.voice.channel?.id;

        if (!member.voice.channel?.permissionsFor(member)?.has(PermissionFlagsBits.Connect) || !voiceChannelId) {
            await this.commandService.send(interaction, "No voice access");
            return;
        }

        this.channelId = voiceChannelId;
        this.connection = getVoiceConnection(this.guildId) || 
            await this.connectToChannel(voiceChannelId, interaction);

        const track = await this.queueService.getTrack(voiceChannelId);
        if (track) await this.playOrQueueTrack(track);

        this.setupDisconnectHandler();
        this.startEmptyCheck();
    }

    public leaveChannel(): void {
        if (this.connection) {
            this.connection.destroy();
            this.reset();
            bot.client.user?.setActivity();
        }
    }

    private async playTrack(track: Track): Promise<void> {
        try {
            this.currentTrack = track;
            this.lastTrack = this.lastTrack || track;

            const resource = createAudioResource(track.url!, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            resource.volume?.setVolumeLogarithmic(0);
            this.resource = resource;
            
            if (this.fadeOutTimeout) clearTimeout(this.fadeOutTimeout);

            setTimeout(() => this.smoothVolumeChange(this.volume / 100, 3000, true, true), 500);

            this.player.play(resource);
            if (!this.loop) {
                await this.queueService.logTrackPlay(track.requestedBy!, track.trackId, track.info);
            }

            this.isPlaying = true;
            bot.client.user?.setActivity(track.info, { type: 3 });

            const duration = await this.getDuration(track.url!);
            this.fadeOutTimeout = setTimeout(() => {
                this.smoothVolumeChange(0, 6000, false);
            }, duration - 8000);

        } catch (error) {
            logger.error(`Play error: ${error}`);
        }
    }

    private async getDuration(url: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const worker = new Worker('./src/workers/trackDurationWorker.js');
            worker.postMessage(url);
            worker.on('message', msg => {
                if (typeof msg === 'number') {
                    resolve(msg);
                } else {
                    reject(logger.error('Invalid message type'));
                }
            });
            worker.on('error', reject);
        });
    }

    private async queueTrack(track: Track): Promise<void> {
        if (this.channelId) {
            await this.queueService.setTrack(this.channelId, this.guildId, track);
        }
    }

    private async loadNextTrack(): Promise<void> {
        if (this.channelId) {
            this.nextTrack = await this.queueService.getTrack(this.channelId);
        }
    }

    private async playNextTrack(): Promise<void> {
        if (this.nextTrack) {
            await this.playTrack(this.loop ? this.lastTrack! : this.nextTrack);
            if (!this.loop) {
                this.nextTrack = null;
                await this.loadNextTrack();
            }
        } else {
            this.reset();
            bot.client.user?.setActivity();
        }
    }

    private setupDisconnectHandler(): void {
        this.connection?.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection!, VoiceConnectionStatus.Signalling, RECONNECTION_TIMEOUT),
                    entersState(this.connection!, VoiceConnectionStatus.Connecting, RECONNECTION_TIMEOUT)
                ]);
            } catch {
                this.handleDisconnect();
            }
        });
    }

    private handleDisconnect(): void {
        if (this.connection) {
            this.connection.removeAllListeners();
            this.connection.destroy();
        }
        this.reset();
        bot.client.user?.setActivity();
    }

    private startEmptyCheck(): void {
        if (this.emptyChannelCheckInterval) clearInterval(this.emptyChannelCheckInterval);
        this.emptyChannelCheckInterval = setInterval(() => this.checkEmpty(), EMPTY_CHANNEL_CHECK_INTERVAL);
    }

    private async checkEmpty(): Promise<void> {
        if (!this.connection || !this.channelId) return;

        try {
            const channel = await bot.client.guilds.fetch(this.guildId)
                .then(g => {
                    if (!this.channelId) {
                        logger.error('Channel ID is null');
                        return null;
                    }
                    return g.channels.fetch(this.channelId);
                })
                .then(c => c as VoiceChannel);

            if (channel.members.filter(m => !m.user.bot).size === 0) {
                this.leaveChannel();
            }
        } catch (error) {
            logger.error(`Empty check error: ${error}`);
        }
    }

    private async connectToChannel(channelId: string, interaction: CommandInteraction): Promise<VoiceConnection> {
        const connection = joinVoiceChannel({
            channelId,
            guildId: this.guildId,
            adapterCreator: interaction.guild?.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            selfDeaf: false
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30000);
            connection.subscribe(this.player);
            return connection;
        } catch (error) {
            connection.destroy();
            throw error;
        }
    }

    private handleTrackEnd = async (): Promise<void> => {
        this.lastTrack = this.currentTrack;
        this.isPlaying = false;
        this.currentTrack = null;
        await this.playNextTrack();
    };

    private reset(): void {
        this.connection = null;
        this.currentTrack = this.nextTrack = null;
        this.isPlaying = false;
        if (this.emptyChannelCheckInterval) {
            clearInterval(this.emptyChannelCheckInterval);
            this.emptyChannelCheckInterval = null;
        }
    }

    public smoothVolumeChange(target: number, duration: number, memorize = true, zero = false): Promise<void> {
        return new Promise(resolve => {
            const start = zero ? 0 : this.volume / 100 || 0;
            const diff = target - start;
            const startTime = Date.now();
            
            if (memorize) this.volume = target * 100;

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                const vol = start + diff * progress;
                this.resource?.volume?.setVolumeLogarithmic(Math.max(0, Math.min(1, vol)));
                
                if (progress < 1) {
                    setTimeout(animate, 16); // ~60fps
                } else {
                    resolve();
                }
            };

            animate();
        });
    }
}