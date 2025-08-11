import type { Track } from "../../types/audio.js";
import { PlayerServiceEvents } from "../../types/audio.js";
import type { Bot } from "../../bot.js";
import { TrackManager } from "./TrackManager.js";

export class PlayerQueue {
	constructor(
		private readonly guildId: string,
		private readonly bot: Bot,
		private readonly emit: (event: string, ...args: any[]) => void,
		private readonly trackmanager: TrackManager,
	) {}

	async queueTrack(track: Track): Promise<void> {
		if (this.guildId) {
			await this.bot.queueService.setTrack(this.guildId, {
				...track,
				priority: true,
			});
			this.emit(PlayerServiceEvents.TRACK_QUEUED, track);
		}
	}

	async loadNextTrack(): Promise<Track | null> {
		if (!this.guildId) return null;
		const nextTrack = await this.bot.queueService.getTrack(this.guildId);
		return nextTrack ?? null;
	}

	async playNextTrack(
		currentTrack: Track | null,
		loop: boolean,
		playTrack: (track: Track) => Promise<boolean>,
		tryPlayRecommendations: () => Promise<void>,
	): Promise<void> {
		if (loop && currentTrack) {
			await playTrack(currentTrack);
		} else {
			const nextTrack = await this.loadNextTrack();
			if (nextTrack) {
				await playTrack(nextTrack);
			} else {
				await tryPlayRecommendations();
			}
		}
	}

	async tryPlayRecommendations(
		lastTrack: Track | null,
		playTrack: (track: Track) => Promise<boolean>,
	): Promise<void> {
		try {
			const waveEnabled = this.bot.queueService.getWave(this.guildId);
			if (waveEnabled && lastTrack?.trackId && lastTrack.source === "yandex") {
				const recommendations = await this.trackmanager.getRecommendations(
					lastTrack.trackId,
				);
				if (recommendations.length > 0) {
					const nextTrack = {
						...recommendations[0],
						requestedBy: lastTrack.requestedBy,
					};
					await playTrack(nextTrack);
					this.bot.queueService.setLastTrackID(this.guildId, nextTrack.trackId);
					return;
				}
			}
			this.emit(PlayerServiceEvents.QUEUE_EMPTY);
		} catch {
			this.emit(PlayerServiceEvents.QUEUE_EMPTY);
		}
	}
}
