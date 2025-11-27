import type { Track } from "../../types/index.js";
import { PlayerServiceEvents } from "../../types/audio.js";
import type { Bot } from "../../bot.js";
import type { TrackManager } from "./TrackManager.js";

export class PlayerQueue {
	constructor(
		private readonly guildId: string,
		private readonly bot: Bot,
		private readonly emit: (event: string, ...args: any[]) => void,
		private readonly trackManager: TrackManager,
	) {
		if (!guildId?.trim()) {
			throw new Error("PlayerQueue requires a valid guildId");
		}
	}

	async queueTrack(track: Track | null): Promise<void> {
		if (!track) {
			this.bot.logger?.warn?.("[PlayerQueue] Attempted to queue null track");
			return;
		}

		this.bot.logger?.debug?.(
			`[PlayerQueue] Queueing track for guild ${this.guildId}: ${track.info}`,
		);

		try {
			this.bot.queueService?.clearWaveState?.(this.guildId);

			if (!this.guildId) {
				this.bot.logger?.warn?.("[PlayerQueue] No guildId for queueTrack");
				return;
			}

			await this.bot.queueService?.setTrack?.(this.guildId, {
				...track,
				priority: true,
			});

			this.emit(PlayerServiceEvents.TRACK_QUEUED, track);
		} catch (error) {
			this.bot.logger?.error?.(
				`[PlayerQueue] Error queueing track: ${(error as Error).message}`,
			);
		}
	}

	async loadNextTrack(): Promise<Track | null> {
		if (!this.guildId) {
			return null;
		}

		try {
			const nextTrack = await this.bot.queueService?.getTrack?.(this.guildId);
			return nextTrack ?? null;
		} catch (error) {
			this.bot.logger?.error?.(
				`[PlayerQueue] Error loading next track: ${(error as Error).message}`,
			);
			return null;
		}
	}

	async peekNextTrack(): Promise<Track | null> {
		if (!this.guildId) {
			return null;
		}

		try {
			const nextTrack = await this.bot.queueService?.peekTrack?.(this.guildId);
			return nextTrack ?? null;
		} catch (error) {
			this.bot.logger?.error?.(
				`[PlayerQueue] Error peeking next track: ${(error as Error).message}`,
			);
			return null;
		}
	}

	async playNextTrack(
		currentTrack: Track | null,
		loop: boolean,
		playTrack: (track: Track) => Promise<boolean>,
		tryPlayRecommendations: () => Promise<void>,
	): Promise<void> {
		try {
			if (loop && currentTrack && !currentTrack.generation) {
				this.bot.logger?.debug?.(
					`[PlayerQueue] Replaying track due to loop: ${currentTrack.info}`,
				);
				await playTrack(currentTrack);
				return;
			}

			const nextTrack = await this.loadNextTrack();
			if (nextTrack) {
				this.bot.logger?.debug?.(
					`[PlayerQueue] Playing next queued track: ${nextTrack.info}`,
				);
				this.bot.queueService?.clearWaveState?.(this.guildId);
				await playTrack(nextTrack);
			} else {
				this.bot.logger?.debug?.(
					"[PlayerQueue] No next track, trying recommendations",
				);
				await tryPlayRecommendations();
			}
		} catch (error) {
			this.bot.logger?.error?.(
				`[PlayerQueue] Error in playNextTrack: ${(error as Error).message}`,
			);
			this.emit(PlayerServiceEvents.QUEUE_EMPTY);
		}
	}

	async tryPlayRecommendations(
		lastTrack: Track | null,
		playTrack: (track: Track) => Promise<boolean>,
	): Promise<void> {
		try {
			if (!lastTrack?.trackId) {
				this.emit(PlayerServiceEvents.QUEUE_EMPTY);
				return;
			}

			const waveEnabled = this.bot.queueService?.getWave?.(this.guildId);
			if (!waveEnabled || lastTrack.source !== "yandex") {
				this.emit(PlayerServiceEvents.QUEUE_EMPTY);
				return;
			}

			this.bot.logger?.debug?.(
				`[PlayerQueue] Fetching recommendations for: ${lastTrack.trackId}`,
			);

			const recommendations = await this.trackManager.getRecommendations(
				lastTrack.trackId,
			);

			if (recommendations.length > 0) {
				const nextTrack: Track = {
					...recommendations[0],
					requestedBy: lastTrack.requestedBy,
					waveStatus: true,
				};

				this.bot.logger?.debug?.(
					`[PlayerQueue] Playing recommendation: ${nextTrack.info}`,
				);
				await playTrack(nextTrack);
			} else {
				this.emit(PlayerServiceEvents.QUEUE_EMPTY);
			}
		} catch (error) {
			this.bot.logger?.error?.(
				`[PlayerQueue] Error in tryPlayRecommendations: ${(error as Error).message}`,
			);
			this.emit(PlayerServiceEvents.QUEUE_EMPTY);
		}
	}
}
