import type { FastifyInstance, FastifyReply } from "fastify";
import { bot } from "../bot.js";
import type { Track } from "../interfaces/index.js";
import logger from "../utils/logger.js";

interface QueueParams {
	guildId: string;
	channelId?: string;
}

interface QueueBody {
	action: "add" | "clear";
	track?: Track;
}

interface VolumeBody {
	volume: number;
}

interface LoopBody {
	enabled: boolean;
}

const handleError = (reply: FastifyReply, error: unknown, message: string) => {
	logger.error(
		`${message}: ${error instanceof Error ? error.message : String(error)}`,
	);
	return reply.status(500).send({ success: false, message });
};

export async function registerRoutes(server: FastifyInstance) {
	server.get<{ Params: QueueParams }>("/queue/:guildId", async (request) => {
		const { guildId } = request.params;
		const queue = await bot.queueService.getQueue(guildId);
		return queue.tracks.map((track) => ({
			...track,
			addedAt: track.addedAt?.toString(),
		}));
	});

	server.get("/top", async () => {
		const tracks = await bot.queueService.getTopPlayedTracks(100);
		return tracks.map((track) => ({
			...track,
			addedAt: track.addedAt?.toString(),
		}));
	});

	server.post<{ Params: QueueParams; Body: QueueBody }>(
		"/queue/:guildId",
		async (request, reply) => {
			const { guildId } = request.params;
			const { action, track } = request.body;

			try {
				if (action === "add" && track) {
					await bot.queueService.setTrack(guildId, track);
					return { success: true, message: "Track added to queue" };
				} else if (action === "clear") {
					await bot.queueService.clearQueue(guildId);
					return { success: true, message: "Queue cleared" };
				}
				return { success: false, message: "Invalid action" };
			} catch (error) {
				return handleError(reply, error, "Failed to manage queue");
			}
		},
	);

	server.post<{ Params: { guildId: string }; Body: VolumeBody }>(
		"/player/volume/:guildId",
		async (request, reply) => {
			const { guildId } = request.params;
			const { volume } = request.body;

			try {
				await bot.playerManager.setVolume(guildId, volume);
				return {
					success: true,
					message: bot.messages.VOLUME_SET(volume),
				};
			} catch (error) {
				return handleError(reply, error, "Failed to set volume");
			}
		},
	);

	server.post<{ Params: { guildId: string }; Body: LoopBody }>(
		"/player/loop/:guildId",
		async (request, reply) => {
			const { guildId } = request.params;
			const { enabled } = request.body;

			try {
				await bot.queueService.setLoop(guildId, enabled);
				return {
					success: true,
					message: `Loop ${enabled ? "enabled" : "disabled"}`,
				};
			} catch (error) {
				return handleError(reply, error, "Failed to set loop");
			}
		},
	);
}
