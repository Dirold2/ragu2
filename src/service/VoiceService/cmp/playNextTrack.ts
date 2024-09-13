import { AudioPlayer, createAudioPlayer, createAudioResource } from "@discordjs/voice";

export interface TrackInterface {
    url: string;
    info: string;
}

export class playNextTrack {
    private player: AudioPlayer = createAudioPlayer();

    async playNextTrack(track: TrackInterface): Promise<void> {
        if (track) {
            const resource = createAudioResource(track.url);
            if (resource) {
                this.player.play(resource);
            }
        } else {
            this.player.stop(true);
        }
    }

}