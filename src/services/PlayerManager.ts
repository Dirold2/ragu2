import { CommandInteraction } from 'discord.js';
import { 
    PlayerService, 
    QueueService, 
    CommandService 
} from './index.js';
import logger from '../utils/logger.js';
import { Track } from '../interfaces/index.js';

export default class PlayerManager {
    private players: Map<string, PlayerService> = new Map();
    private queueService: QueueService;
    private commandService: CommandService;

    constructor(queueService: QueueService, commandService: CommandService) {
        this.queueService = queueService;
        this.commandService = commandService;
    }

    public getPlayer(guildId: string): PlayerService {
        if (!this.players.has(guildId)) {
            logger.debug(`Creating new PlayerService for guild ${guildId}`);
            const player = new PlayerService(this.queueService, this.commandService, guildId);
            this.players.set(guildId, player);
        }
        return this.players.get(guildId)!;
    }

    public async joinChannel(interaction: CommandInteraction): Promise<void> {
        const guildId = interaction.guildId;
            if (!guildId) {
            await this.commandService.send(interaction, "This command can only be used in a server.");
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
            await this.commandService.send(interaction, "This command can only be used in a server.");
            return;
        }
        const player = this.getPlayer(guildId);
        await player.skip(interaction);
    }

    public async togglePause(interaction: CommandInteraction): Promise<void> {
        const guildId = interaction.guildId;
            if (!guildId) {
            await this.commandService.send(interaction, "This command can only be used in a server.");
            return;
        }
        const player = this.getPlayer(guildId);
        await player.togglePause(interaction);
    }

    public setVolume(guildId: string, volume: number): void {
        const player = this.getPlayer(guildId);
        player.setVolume(volume);
    }

    public leaveChannel(guildId: string): void {
        const player = this.players.get(guildId);
            if (player) {
            player.leaveChannel();
            this.players.delete(guildId);
        }
    }
}