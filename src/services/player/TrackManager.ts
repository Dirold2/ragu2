import { EventEmitter } from "eventemitter3";
import type { Track } from "../../types/index.js";
import { getAudioDurationInSeconds } from "get-audio-duration";
import { Bot } from "../../bot.js";

export class TrackManager extends EventEmitter {
	private bot: Bot;

	constructor(bot: Bot) {
		super();
		this.bot = bot;
	}

	/**
	 * Gets track URL dynamically
	 */
	async getTrackUrl(trackId: string, source: string): Promise<string | null> {
		try {
			if (source === "url") return trackId;

			const plugin = this.bot?.pluginManager?.getPlugin(source);
			if (!plugin?.getTrackUrl) {
				this.bot?.logger.error(
					this.bot.locale.t(
						"messages.playerService.player.error.plugin_not_found",
						{ source },
					),
				);
				return null;
			}

			const url = await plugin.getTrackUrl(trackId);
			if (!url) {
				return null;
			}

			return url;
		} catch (error) {
			this.bot?.logger.error(
				this.bot.locale.t("messages.playerService.player.error.get_track_url", {
					trackId,
					error: (error as Error).message,
				}),
			);
			return null;
		}
	}

	/**
	 * Gets track duration in milliseconds
	 */
	async getDuration(url: string): Promise<number> {
		try {
			const durationInSeconds = await getAudioDurationInSeconds(
				url,
				process.env.FFPROBE_PATH || undefined,
			);
			return Math.round(durationInSeconds * 1000);
		} catch (error) {
			return 0;
		}
	}

	/**
	 * Gets recommendations for a track
	 */
	async getRecommendations(trackId: string): Promise<Track[]> {
		try {
			const plugin = this.bot?.pluginManager?.getPlugin("yandex");
			if (!plugin?.getRecommendations) {
				return [];
			}

			const rawRecommendations = await plugin.getRecommendations(trackId);

			const recommendations: Track[] = rawRecommendations.map((rec: any) => ({
				trackId: rec.id,
				info: `${rec.title} - ${rec.artists?.map((a: any) => a.name).join(", ")}`,
				source: rec.source,
				priority: false,
				durationMs: rec.durationMs,
				generation: rec.generation,
			}));
			return recommendations;
		} catch (error) {
			this.bot?.logger.error(
				`Failed to get recommendations for ${trackId}:`,
				error,
			);
			return [];
		}
	}
}
