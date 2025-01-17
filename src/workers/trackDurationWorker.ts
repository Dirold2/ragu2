import { parentPort } from 'worker_threads';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import pathToFfmpeg from 'ffmpeg-ffprobe-static';

if (parentPort) {
    parentPort.on('message', async (url: string) => {
        try {
            const durationInSeconds: number = await getAudioDurationInSeconds(url, `${pathToFfmpeg.ffprobePath}`);
            parentPort?.postMessage(durationInSeconds * 1000);
        } catch (error: any) {
            parentPort?.postMessage({ error: error.message });
        }
    });
}