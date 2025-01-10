import { CommandInteraction } from 'discord.js';

import { Track } from '../interfaces/index.js';
import logger from '../utils/logger.js';
import { CommandService, PlayerService, QueueService } from './index.js';

const SERVER_ONLY_ERROR = "This command can only be used in a server.";

export default class PlayerManager {
    private players: Map<string, PlayerService> = new Map();
    private queueService: QueueService;
    private commandService: CommandService;

    constructor(
        queueService: QueueService,
        commandService: CommandService,
    ) {
        this.queueService = queueService;
        this.commandService = commandService;
    }

    public getPlayer(guildId: string): PlayerService {
        let player = this.players.get(guildId);
        if (!player) {
            logger.debug(`Creating new PlayerService for guild ${guildId}`);
            player = new PlayerService(this.queueService, this.commandService, guildId);
            this.players.set(guildId, player);
        }
        return player;
    }

    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        const guildId = interaction.guildId;
        if (!guildId) {
            await this.commandService.send(interaction, SERVER_ONLY_ERROR);
            return;
        }
        const player = this.getPlayer(guildId);
        await player.joinChannel(interaction);
    }

    public async playOrQueueTrack(guildId: string, track: Track): Promise<void> {
        const player = this.getPlayer(guildId);
        await player.playOrQueueTrack(track);
    }

    public async skip(interaction: CommandInteraction): Promise<void> {
        const guildId = interaction.guildId;
        if (!guildId) {
            await this.commandService.send(interaction, SERVER_ONLY_ERROR);
            return;
        }
        const player = this.getPlayer(guildId);
        await player.skip(interaction);
    }

    public async togglePause(interaction: CommandInteraction): Promise<void> {
        const guildId = interaction.guildId;
        if (!guildId) {
            await this.commandService.send(interaction, SERVER_ONLY_ERROR);
            return;
        }
        const player = this.getPlayer(guildId);
        await player.togglePause(interaction);
    }

    public async setVolume(interaction: CommandInteraction, volume: number): Promise<void> {
        const guildId = interaction.guildId;
        if (!guildId) {
            await this.commandService.send(interaction, SERVER_ONLY_ERROR);
            return;
        }
        const player = this.getPlayer(guildId);

        // await this.queueService.setVolume(guildId, volume);

        await player.setVolume(volume);
    }

    public leaveChannel(guildId: string): void {
        const player = this.players.get(guildId);
        if (player) {
            player.leaveChannel();
            this.players.delete(guildId);
        } else {
            logger.warn(`Attempted to leave channel for non-existent player in guild ${guildId}`);
        }
    }
}