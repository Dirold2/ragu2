import type { Track } from "../../types/index.js";
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
		this.bot.logger.debug(`[PlayerQueue] queueTrack called for guild ${this.guildId}, track: ${track.info}`);
		
		if (this.guildId) {
			await this.bot.queueService.setTrack(this.guildId, {
				...track,
				priority: true,
			});
			this.emit(PlayerServiceEvents.TRACK_QUEUED, track);
			this.bot.logger.debug(`[PlayerQueue] Track queued successfully for guild ${this.guildId}`);
		} else {
			this.bot.logger.warn(`[PlayerQueue] No guildId provided for queueTrack`);
		}
	}

	async loadNextTrack(): Promise<Track | null> {
		this.bot.logger.debug(`[PlayerQueue] loadNextTrack called for guild ${this.guildId}`);
		
		if (!this.guildId) {
			this.bot.logger.debug(`[PlayerQueue] No guildId, returning null`);
			return null;
		}
		
		const nextTrack = await this.bot.queueService.getTrack(this.guildId);
		this.bot.logger.debug(`[PlayerQueue] Next track loaded: ${nextTrack?.info || 'null'}`);
		return nextTrack ?? null;
	}

	async peekNextTrack(): Promise<Track | null> {
		this.bot.logger.debug(`[PlayerQueue] peekNextTrack called for guild ${this.guildId}`);
		if (!this.guildId) {
			this.bot.logger.debug(`[PlayerQueue] No guildId, returning null`);
			return null;
		}
		const nextTrack = await this.bot.queueService.peekTrack(this.guildId);
		this.bot.logger.debug(`[PlayerQueue] Peek next track: ${nextTrack?.info || 'null'}`);
		return nextTrack ?? null;
	}

	async playNextTrack(
		currentTrack: Track | null,
		loop: boolean,
		playTrack: (track: Track) => Promise<boolean>,
		tryPlayRecommendations: () => Promise<void>,
	): Promise<void> {
		this.bot.logger.debug(`[PlayerQueue] playNextTrack called for guild ${this.guildId}`);
		this.bot.logger.debug(`[PlayerQueue] Current track: ${currentTrack?.info || 'unknown'}`);
		this.bot.logger.debug(`[PlayerQueue] Loop enabled: ${loop}`);
		
		if (loop && currentTrack) {
			this.bot.logger.debug(`[PlayerQueue] Playing current track again due to loop`);
			await playTrack(currentTrack);
		} else {
			this.bot.logger.debug(`[PlayerQueue] Loading next track from queue`);
			const nextTrack = await this.loadNextTrack();
			if (nextTrack) {
				this.bot.logger.debug(`[PlayerQueue] Found next track: ${nextTrack.info}`);
				await playTrack(nextTrack);
			} else {
				this.bot.logger.debug(`[PlayerQueue] No next track found, trying recommendations`);
				await tryPlayRecommendations();
			}
		}
	}

	async tryPlayRecommendations(
		lastTrack: Track | null,
		playTrack: (track: Track) => Promise<boolean>,
	): Promise<void> {
		try {
			this.bot.logger.debug(`[PlayerQueue] tryPlayRecommendations called for guild ${this.guildId}`);
			this.bot.logger.debug(`[PlayerQueue] Last track: ${lastTrack?.info || 'unknown'}`);
			
			const waveEnabled = this.bot.queueService.getWave(this.guildId);
			this.bot.logger.debug(`[PlayerQueue] Wave enabled: ${waveEnabled}`);
			
			if (waveEnabled && lastTrack?.trackId && lastTrack.source === "yandex") {
				this.bot.logger.debug(`[PlayerQueue] Getting recommendations for Yandex track`);
				const recommendations = await this.trackmanager.getRecommendations(
					lastTrack.trackId,
				);
				if (recommendations.length > 0) {
					const nextTrack = {
						...recommendations[0],
						requestedBy: lastTrack.requestedBy,
					};
					this.bot.logger.debug(`[PlayerQueue] Playing recommendation: ${nextTrack.info}`);
					await playTrack(nextTrack);
					this.bot.queueService.setLastTrackID(this.guildId, nextTrack.trackId);
					return;
				}
			}
			this.bot.logger.debug(`[PlayerQueue] No recommendations available, emitting QUEUE_EMPTY`);
			this.emit(PlayerServiceEvents.QUEUE_EMPTY);
		} catch (error) {
			this.bot.logger.error(`[PlayerQueue] Error in tryPlayRecommendations: ${error}`);
			this.emit(PlayerServiceEvents.QUEUE_EMPTY);
		}
	}
}
