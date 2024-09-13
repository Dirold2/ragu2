import { AudioPlayer, AudioPlayerStatus, createAudioPlayer } from "@discordjs/voice";

export class resume {
    private player: AudioPlayer = createAudioPlayer();

    async resume(): Promise<void> {
        if (this.player.state.status === AudioPlayerStatus.Paused) {
            this.player.unpause();
        }
    }

}