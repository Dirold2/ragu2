import { AudioPlayer, createAudioPlayer } from "@discordjs/voice";

export class stopPlayer {
    private player: AudioPlayer = createAudioPlayer();
    
    public stopPlayer(): void {
        this.player.stop(true);
    }
}