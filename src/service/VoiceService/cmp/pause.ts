import { AudioPlayer, createAudioPlayer } from "@discordjs/voice";
import { isPlaying } from "./isPlaying.ts";

export class pause {
    private player: AudioPlayer = createAudioPlayer();
    private isplaying = new isPlaying();

    public pause(): void {
        if (this.isplaying.isPlaying()) {
            this.player.pause();
        }
    }

}