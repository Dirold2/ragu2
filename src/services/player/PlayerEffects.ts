import { DEFAULT_FADEIN, DEFAULT_FADEOUT } from "../../utils/constants.js";
import type { AudioService } from "../audio/AudioService.js";

export class PlayerEffects {
	private fadeOutTimer: NodeJS.Timeout | null = null;

	constructor(private audioService: AudioService) {}

	async fadeIn(targetVolume: number): Promise<void> {
		const volume = Math.max(0, Math.min(100, targetVolume)) / 100;
		await this.audioService.setVolume(0, 0, false);
		await this.audioService.setVolume(volume, DEFAULT_FADEIN, true);
	}

	async scheduleFadeOut(
		duration: number,
		action: () => Promise<void>,
	): Promise<NodeJS.Timeout | null> {
		try {
			if (!duration || typeof duration !== "number" || duration <= 0) {
				return null;
			}

			if (duration > DEFAULT_FADEOUT) {
				const delay = duration - DEFAULT_FADEOUT;
				this.fadeOutTimer = setTimeout(async () => {
					try {
						await action();
					} catch (error) {
						console.error("[PlayerEffects] Error in scheduled fadeOut:", error);
					}
				}, delay);

				return this.fadeOutTimer;
			}
		} catch (error) {
			console.error("[PlayerEffects] Error scheduling fadeOut:", error);
		}

		return null;
	}

	async setVolume(volume: number, duration = 2000, set = true): Promise<void> {
		const normalizedVolume = Math.max(0, Math.min(100, volume)) / 100;
		await this.audioService.setVolume(normalizedVolume, duration, set);
	}

	async setVolumeFast(volume: number, set = false): Promise<void> {
		const normalizedVolume = Math.max(0, Math.min(100, volume)) / 100;
		this.audioService.setVolumeFast(normalizedVolume, set);
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

	/**
	 * Clears scheduled fade out timer
	 */
	clearFadeOutTimer(): void {
		if (this.fadeOutTimer) {
			clearTimeout(this.fadeOutTimer);
			this.fadeOutTimer = null;
		}
	}

	/**
	 * Cleanup on destroy
	 */
	destroy(): void {
		this.clearFadeOutTimer();
	}
}
