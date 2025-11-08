import { DEFAULT_FADEIN, DEFAULT_FADEOUT } from "../../utils/constants.js";
import type { AudioService } from "../audio/AudioService.js";

export class PlayerEffects {
	constructor(private audioService: AudioService) {}

	async fadeIn(targetVolume: number): Promise<void> {
		await this.audioService.setVolume(0, 0, false);
		await this.audioService.setVolume(targetVolume / 100, DEFAULT_FADEIN, true);
	}

	async scheduleFadeOut(
		duration: number,
		action: () => Promise<void>,
	): Promise<NodeJS.Timeout | null> {
		try {
			if (duration && duration > DEFAULT_FADEOUT) {
				return setTimeout(async () => {
					await action();
				}, duration - DEFAULT_FADEOUT);
			}
		} catch {}
		return null;
	}

	async setVolume(volume: number, duration = 2000, set = true): Promise<void> {
		await this.audioService.setVolume(volume / 100, duration, set);
	}

	async setVolumeFast(volume: number, set = false): Promise<void> {
		this.audioService.setVolumeFast(volume / 100, set);
	}

	setBass(bass: number): void {
		this.audioService.setBass(bass);
	}

	setTreble(treble: number): void {
		this.audioService.setTreble(treble);
	}

	setCompressor(enabled: boolean): void {
		this.audioService.setCompressor(enabled);
	}
}
