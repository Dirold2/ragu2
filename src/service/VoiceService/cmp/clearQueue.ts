import { AudioPlayer, createAudioPlayer } from "@discordjs/voice";
import { QueueService } from "../../index.ts";

class clearQueue {
    private player: AudioPlayer = createAudioPlayer();
    private readonly queueService = new QueueService();

    async clearQueueModule(): Promise<void> {
        await this.queueService.clearQueue();
        this.player.stop(true);
    }
}

export { clearQueue };