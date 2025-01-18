import { CommandInteraction } from 'discord.js';

import { Track } from '../interfaces/index.js';
import logger from '../utils/logger.js';
import { CommandService, PlayerService, QueueService } from './index.js';
import { MESSAGES } from '../messages.js';

export default class PlayerManager {
    private readonly players: Map<string, PlayerService> = new Map();
    private readonly queueService: QueueService;
    private readonly commandService: CommandService;

    constructor(
        queueService: QueueService,
        commandService: CommandService,
    ) {
        this.queueService = queueService;
        this.commandService = commandService;
    }

    public async handleServerOnlyCommand(interaction: CommandInteraction): Promise<string | null> {
        const guildId = interaction.guildId;
        if (!guildId) {
            await this.commandService.send(interaction, MESSAGES.SERVER_ONLY_ERROR);
            return null;
        }
        return guildId;
    }

    public getPlayer(guildId: string): PlayerService {
        const existingPlayer = this.players.get(guildId);
        if (existingPlayer) {
            return existingPlayer;
        }

        logger.debug(`Creating new PlayerService for guild ${guildId}`);
        const newPlayer = new PlayerService(this.queueService, this.commandService, guildId);
        newPlayer.initializeLoop();
        this.players.set(guildId, newPlayer);
        return newPlayer;
    }

    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        const guildId = await this.handleServerOnlyCommand(interaction);
        if (!guildId) return;

        const player = this.getPlayer(guildId);
        await player.joinChannel(interaction);
    }

    public async playOrQueueTrack(guildId: string, track: Track): Promise<void> {
        const player = this.getPlayer(guildId);
        await player.playOrQueueTrack(track);
    }

    public async skip(interaction: CommandInteraction): Promise<void> {
        const guildId = await this.handleServerOnlyCommand(interaction);
        if (!guildId) return;

        const player = this.getPlayer(guildId);
        await player.skip(interaction);
    }

    public async togglePause(interaction: CommandInteraction): Promise<void> {
        const guildId = await this.handleServerOnlyCommand(interaction);
        if (!guildId) return;

        const player = this.getPlayer(guildId);
        await player.togglePause(interaction);
    }

    public async setVolume(guildId: string, volume: number): Promise<void> {
        if (!guildId) return;

        const player = this.getPlayer(guildId);
        player.setVolume(volume);
    }

    public leaveChannel(guildId: string): void {
        const player = this.players.get(guildId);
        if (!player) {
            logger.warn(`Attempted to leave channel for non-existent player in guild ${guildId}`);
            return;
        }

        player.leaveChannel();
        this.players.delete(guildId);
    }
}