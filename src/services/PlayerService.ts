import { Discord } from "discordx";
import { QueueService, CommandService } from "./index.js";
import { 
    AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, 
    DiscordGatewayAdapterCreator, entersState, getVoiceConnection, 
    joinVoiceChannel, StreamType, VoiceConnection, VoiceConnectionStatus,
    AudioResource
} from "@discordjs/voice";
import logger from "../utils/logger.js";
import { CommandInteraction, GuildMember, PermissionFlagsBits } from "discord.js";

interface Track {
    url: string;
    info: string;
    source: string;
    trackId: string;
    addedAt?: bigint;
    waveStatus?: boolean;
}

const RECONNECTION_TIMEOUT = 5000;

@Discord()
export class PlayerService {
    private player: AudioPlayer | null = null;
    private connection: VoiceConnection | null = null;
    public guildId: string = "";
    public channelId: string | null = null;
    public volume = 30;
    private currentTrack: Track | null = null;
    private nextTrack: Track | null = null;
    private nextResource: AudioResource | null = null;

    constructor(
        private queueService: QueueService,
        private commandService: CommandService
    ) {
        this.initPlayer();
    }

    public async playOrQueueTrack(track: Track): Promise<void> {
        if (!this.currentTrack) {
            this.currentTrack = track;
            this.play(track);
            await this.preloadNextTrack();
        } else {
            await this.queueService.setTrack(this.channelId, this.guildId, track);
            logger.verbose(`Track added to queue: ${track.info}`);
        }
    }

    private play(track: Track): void {
        const resource = this.createAudioResource(track);
        this.player?.play(resource);
        logger.info(`Playing track: ${track.info}`);
    }

    private createAudioResource(track: Track): AudioResource {
        const resource = createAudioResource(track.url, { 
            inputType: StreamType.Opus, 
            inlineVolume: true 
        });
        resource.volume?.setVolumeLogarithmic(this.volume / 100);
        return resource;
    }

    private async preloadNextTrack(): Promise<void> {
        this.nextTrack = await this.queueService.getTrack(this.channelId);
        if (this.nextTrack) {
            this.nextResource = this.createAudioResource(this.nextTrack);
            logger.verbose(`Preloaded next track: ${this.nextTrack.info}`);
        } else {
            this.nextResource = null;
            logger.verbose('No next track to preload');
        }
    }

    public async skip(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        if (this.nextTrack && this.nextResource) {
            this.currentTrack = this.nextTrack;
            this.player?.play(this.nextResource);
            await this.commandService.send(interaction, `Skipped to next track: ${this.currentTrack.info}`);
            await this.preloadNextTrack();
        } else {
            this.player?.stop();
            this.currentTrack = null;
            await this.commandService.send(interaction, "No more tracks in the queue.");
        }
    }

    public async togglePause(interaction: CommandInteraction): Promise<void> {
        if (!this.ensureConnected(interaction)) return;

        if (this.player?.state.status === AudioPlayerStatus.Playing) {
            this.player.pause();
            await this.commandService.send(interaction, "Playback paused.");
        } else if (this.player?.state.status === AudioPlayerStatus.Paused) {
            this.player.unpause();
            await this.commandService.send(interaction, "Playback resumed.");
        } else {
            await this.commandService.send(interaction, "No track is currently playing.");
        }
    }

    public setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(100, volume));
        if (this.player?.state.status === AudioPlayerStatus.Playing) {
            (this.player.state.resource as AudioResource).volume?.setVolume(this.volume / 100);
        }
    }

    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        const member = interaction.member as GuildMember;
        const voiceChannelId = member.voice.channel?.id;
        const guildId = interaction.guild?.id;

        if (!this.hasVoiceChannelAccess(member) || !guildId || !voiceChannelId) {
            await this.commandService.send(interaction, "No access to voice channel or invalid guild/channel ID.");
            return;
        }

        this.channelId = voiceChannelId;
        this.guildId = guildId;

        this.connection = getVoiceConnection(guildId) || await this.connectToChannel(guildId, voiceChannelId, interaction);
        const track = await this.queueService.getTrack(voiceChannelId);
        if (track) await this.playOrQueueTrack(track);

        this.handleDisconnection();
    }

    public leaveChannel(): void {
        this.connection?.destroy();
        this.currentTrack = null;
        this.nextTrack = null;
        this.nextResource = null;
        logger.info("Disconnected from voice channel.");
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
            connection.subscribe(this.player ?? createAudioPlayer());
            logger.info("Successfully connected to voice channel.");
            return connection;
        } catch (error) {
            connection.destroy();
            logger.error("Failed to connect to voice channel.", error);
            throw new Error("Connection timeout.");
        }
    }

    private ensureConnected(interaction: CommandInteraction): boolean {
        if (!getVoiceConnection(this.guildId)) {
            this.commandService.send(interaction, "Bot is not connected to a voice channel.");
            return false;
        }
        return true;
    }

    private hasVoiceChannelAccess(member: GuildMember): boolean {
        return member.voice.channel?.permissionsFor(member)?.has(PermissionFlagsBits.Connect) ?? false;
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
                logger.error(`Error reconnecting: ${error.message}`);
                this.connection?.destroy();
                this.currentTrack = null;
                this.nextTrack = null;
                this.nextResource = null;
                logger.info("Connection terminated.");
            }
        });
    }

    private initPlayer(): void {
        if (this.player) return;

        this.player = createAudioPlayer();
        this.player.on('error', error => logger.error(`Error in audio player: ${error.message}`));
        this.player.on(AudioPlayerStatus.Idle, this.handleTrackEnd.bind(this));
    }

    private async handleTrackEnd(): Promise<void> {
        if (this.nextTrack && this.nextResource) {
            this.currentTrack = this.nextTrack;
            this.player?.play(this.nextResource);
            await this.preloadNextTrack();
        } else {
            this.currentTrack = null;
            logger.info("Queue is empty, playback stopped.");
        }
    }
}