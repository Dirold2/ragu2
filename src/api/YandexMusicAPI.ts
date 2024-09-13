import { Types, WrappedYMApi, YMApi } from "ym-api-meowed";

export class YandexMusicAPI {
    private api: YMApi;
    private wrapper: WrappedYMApi;

    constructor() {
        this.api = new YMApi();
        this.wrapper = new WrappedYMApi();
        this.api.init({ access_token: process.env.YM_API_KEY, uid: parseInt(process.env.YM_USER_ID || '0', 10) });
    }

    async searchTrack(trackName: string) {
        return this.api.search(trackName, { type: "track" });
    }

    async getTrackUrl(trackId: string) {
        return this.wrapper.getMp3DownloadUrl(trackId, true, Types.DownloadTrackQuality.High);
    }

    async getTrackDownloadInfo(trackId: string) {
        return this.wrapper.getConcreteDownloadInfo(trackId, Types.DownloadTrackCodec.AAC, Types.DownloadTrackQuality.High);
    }
}