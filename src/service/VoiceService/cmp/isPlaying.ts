import { AudioPlayer, AudioPlayerStatus, createAudioPlayer } from "@discordjs/voice";

export class isPlaying {
    private player: AudioPlayer = createAudioPlayer();
    
    public isPlaying(): boolean {
        return this.player.state.status === AudioPlayerStatus.Playing;
    }
}