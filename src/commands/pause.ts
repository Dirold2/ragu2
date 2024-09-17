import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";
import { PlayerService } from "../service/index.js";

@Discord()
export class PauseCommand {
    private readonly playerService: PlayerService;

    constructor() {
        this.playerService = new PlayerService();
    }

    @Slash({ name: "pause", description: "Приостановить или возобновить текущий трек" })
    async pause(interaction: CommandInteraction): Promise<void> {
        await this.playerService.handlePauseCommand(interaction);
    }
}