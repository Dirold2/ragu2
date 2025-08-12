import { EventEmitter } from "eventemitter3";
import type { Track } from "../../types/audio.js";
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
				this.bot?.logger.warn(
					this.bot.locale.t(
						"messages.playerService.player.warning.url_not_found",
						{ trackId, source },
					),
				);
				return null;
			}

			return url;
		} catch (error) {
			this.bot?.logger.error(
				this.bot.locale.t("messages.playerService.player.error.get_track_url", {
					trackId,
					error: error instanceof Error ? error.message : String(error),
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

			const recommendations = await plugin.getRecommendations(trackId);
			return recommendations.map(
				(rec: { id: string; title: string; artists: any[] }) => ({
					source: "yandex",
					trackId: rec.id,
					info: `${rec.title} - ${rec.artists.map((a: { name: string }) => a.name).join(", ")}`,
					requestedBy: undefined,
				}),
			);
		} catch (error) {
			this.bot?.logger.error(
				`Failed to get recommendations for ${trackId}:`,
				error,
			);
			return [];
		}
	}
}
