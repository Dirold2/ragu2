import { AudioPlayer, AudioPlayerStatus, createAudioPlayer } from "@discordjs/voice";

export class unpause {
    private player: AudioPlayer = createAudioPlayer();

    public unpause(): void {
        if (this.player.state.status === AudioPlayerStatus.Paused) {
            this.player.unpause();
        }
    }

}