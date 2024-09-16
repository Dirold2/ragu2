export interface AudioSource {
    getAudioStream(url: string): Promise<NodeJS.ReadableStream>;
    getTrackInfo(url: string): Promise<TrackInfo>;
}

export interface TrackInfo {
    title: string;
    artist: string;
    duration: number;
}
