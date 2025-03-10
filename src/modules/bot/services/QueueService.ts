import { PrismaClient, Queue, Tracks } from "@prisma/client";

import { QueueResult, Track } from "../interfaces/index.js";
import logger from "../../../utils/logger.js";
import { TrackSchema } from "./index.js";
import { bot } from "../bot.js";

/** Custom error class for QueueService specific errors */
class QueueServiceError extends Error {
	constructor(
		message: string,
		public details?: unknown,
	) {
		super(message);
		this.name = "QueueServiceError";
	}
}

// interface QueueState {
// 	tracks: Track[];
// 	loop: boolean;
// }

/**
 * Service for managing music queue operations
 * @class QueueService
 */
export default class QueueService {
	private readonly prisma: PrismaClient;
	private static readonly DEFAULT_VOLUME = 10;
	private static readonly DEFAULT_TRANSACTION_TIMEOUT = 10000;
	private static readonly BATCH_SIZE = 50;
	// private readonly queues: Map<string, QueueState> = new Map();

	constructor() {
		this.prisma = new PrismaClient();
	}

	/**
	 * Adds a track to the queue for a specific guild
	 * @param {string} guildId - Discord guild ID
	 * @param {Omit<Track, 'id'>} track - Track to add
	 */
	public async setTrack(
		guildId: string,
		track: Omit<Track, "id">,
	): Promise<void> {
		this.validateParams(guildId, track.trackId);

		try {
			const validatedTrack = TrackSchema.parse(track);
			await this.prisma.$transaction(
				async (txPrisma) => {
					const existingTrack = await this.isTrackInQueue(
						txPrisma,
						track.trackId,
						guildId,
					);
					if (!existingTrack) {
						await this.createTrackWithQueue(txPrisma, validatedTrack, guildId);
					}
				},
				{ timeout: QueueService.DEFAULT_TRANSACTION_TIMEOUT },
			);
		} catch (error) {
			this.handleError(
				error,
				bot.locale.t('queue.error_adding_track', { trackId: track.trackId })
			);
		}
	}

	/**
	 * Gets and removes the next track from the queue
	 * @param {string} guildId - Discord guild ID
	 * @returns {Promise<Track | null>} Next track or null if queue is empty
	 */
	public async getTrack(guildId: string): Promise<Track | null> {
		if (!guildId)
			throw new QueueServiceError(bot.locale.t('queue.guild_id_required'));
		try {
			return await this.prisma.$transaction(async (txPrisma) => {
				const nextTrack = await txPrisma.tracks.findFirst({
					where: { Queue: { guildId } },
					orderBy: [{ priority: "desc" }, { addedAt: "asc" }],
				});

				if (!nextTrack) return null;

				const trackExists = await txPrisma.tracks.count({
					where: { id: nextTrack.id },
				});
				if (trackExists > 0) {
					await txPrisma.tracks.delete({
						where: { id: nextTrack.id },
					});
				}
				return this.mapPrismaTrackToTrack(nextTrack);
			});
		} catch (error) {
			this.handleError(
				error,
				bot.locale.t('queue.error_retrieving_track', { guildId })
			);
			return null;
		}
	}

	/**
	 * Gets the next track from the queue with priority
	 * @param {string} guildId - Discord guild ID
	 * @returns {Promise<Track | null>} Next track with priority or null
	 */
	public async getTrackWithPriority(guildId: string): Promise<Track | null> {
		const track = await this.prisma.tracks.findFirst({
			where: { Queue: { guildId }, priority: true },
			orderBy: { addedAt: "asc" },
		});

		if (!track) return null;

		await this.prisma.tracks.delete({ where: { id: track?.id } });
		return track ? this.mapPrismaTrackToTrack(track) : null;
	}

	/**
	 * Gets the current queue state for a channel
	 * @param {string} guildId - Discord guild ID
	 * @returns {Promise<QueueResult>} Queue state
	 */
	public async getQueue(guildId: string): Promise<QueueResult> {
		try {
			const queue = await this.prisma.queue.findUnique({
				where: { guildId },
				include: {
					tracks: {
						orderBy: [{ priority: "desc" }, { addedAt: "asc" }],
					},
				},
			});

			return queue
				? this.mapQueueToQueueResult(queue)
				: this.createEmptyQueueResult();
		} catch (error) {
			this.handleError(
				error,
				bot.locale.t('queue.error_fetching_queue', { guildId })
			);
			return this.createEmptyQueueResult();
		}
	}

	/**
	 * Sets the ID of the last played track
	 * @param {string} guildId - Discord guild ID
	 * @param {string} [trackId] - Track ID
	 */
	public async setLastTrackID(
		guildId: string,
		trackId?: string,
	): Promise<void> {
		await this.prisma.queue.updateMany({
			where: { guildId },
			data: { lastTrackId: trackId ?? null },
		});
	}

	/**
	 * Gets the ID of the last played track
	 * @param {string} guildId - Discord guild ID
	 * @returns {Promise<string | null>} Last track ID or null
	 */
	public async getLastTrackID(guildId: string): Promise<string | null> {
		const queue = await this.prisma.queue.findFirst({
			where: { guildId },
			select: { lastTrackId: true },
		});
		return queue?.lastTrackId ?? null;
	}

	/**
	 * Clears all tracks from the queue
	 * @param {string} channelId - Discord channel ID
	 */
	public async clearQueue(guildId: string): Promise<void> {
		try {
			await this.prisma.queue.update({
				where: { guildId },
				data: {
					tracks: { deleteMany: {} },
					lastTrackId: null,
				},
			});
		} catch (error) {
			this.handleError(
				error,
				bot.locale.t('queue.error_clearing_queue', { guildId })
			);
		}
	}

	/**
	 * Gets the wave status for a guild
	 * @param {string} guildId - Discord guild ID
	 * @returns {Promise<boolean>} Wave status
	 */
	public async getWaveStatus(guildId: string): Promise<boolean> {
		const queue = await this.prisma.queue.findFirst({
			where: { guildId },
			select: { waveStatus: true },
		});
		return queue?.waveStatus ?? false;
	}

	/**
	 * Sets the wave status for a channel
	 * @param {string} guildId - Discord guild ID
	 * @param {boolean} status - Wave status
	 */
	public async setWaveStatus(guildId: string, status: boolean): Promise<void> {
		await this.prisma.queue.updateMany({
			where: { guildId },
			data: { waveStatus: status },
		});
	}

	/**
	 * Counts music tracks in the queue
	 * @param {string} guildId - Discord guild ID
	 * @returns {Promise<number>} Number of tracks
	 */
	public async countMusicTracks(guildId: string): Promise<number> {
		return this.prisma.tracks.count({
			where: { Queue: { guildId } },
		});
	}

	/**
	 * Removes a track from the queue
	 * @param {string} guildId - Discord guild ID
	 * @param {string} trackId - Track ID to remove
	 */
	public async removeTrack(guildId: string, trackId: string): Promise<void> {
		this.validateParams(guildId, trackId);

		try {
			await this.prisma.tracks.deleteMany({
				where: {
					trackId,
					Queue: { guildId },
				},
			});
		} catch (error) {
			this.handleError(
				error,
				bot.locale.t('queue.error_removing_track', { trackId })
			);
		}
	}

	/**
	 * Gets the volume for a guild
	 * @param {string} guildId - Discord guild ID
	 * @returns {Promise<number>} Volume level
	 */
	public async getVolume(guildId: string): Promise<number> {
		const queue = await this.prisma.queue.findFirst({
			where: { guildId },
			select: { volume: true },
		});
		return queue?.volume ?? QueueService.DEFAULT_VOLUME;
	}

	/**
	 * Sets the volume for a guild
	 * @param {string} guildId - Discord guild ID
	 * @param {number} volume - Volume level
	 */
	public async setVolume(guildId: string, volume: number): Promise<void> {
		await this.prisma.queue.updateMany({
			where: { guildId },
			data: { volume: Number(volume) },
		});
	}

	/**
	 * Gets the loop status for a guild
	 * @param {string} guildId - Discord guild ID
	 * @returns {Promise<boolean>} Loop status
	 */
	public async getLoop(guildId: string): Promise<boolean> {
		const queue = await this.prisma.queue.findFirst({
			where: { guildId },
			select: { loop: true },
		});
		return queue?.loop ?? false;
	}

	/**
	 * Sets the loop status for a guild
	 * @param {string} guildId - Discord guild ID
	 * @param {boolean} loop - Loop status
	 */
	public async setLoop(guildId: string, loop: boolean): Promise<void> {
		await this.prisma.queue.updateMany({
			where: { guildId },
			data: { loop },
		});
		logger.debug(bot.locale.t('queue.loop_set', { guildId }));
	}

	/**
	 * Logs track play in history
	 * @param {string} userId - Discord user ID
	 * @param {string} trackId - Track ID
	 * @param {string} trackName - Track name
	 */
	public async logTrackPlay(
		userId: string,
		trackId: string,
		trackName: string,
	): Promise<void> {
		try {
			await this.prisma.$transaction(async (prisma) => {
				await Promise.all([
					this.updateGlobalHistory(prisma, trackId, trackName),
					this.updateUserHistory(prisma, userId, trackId, trackName),
				]);
			});
		} catch (error) {
			this.handleError(
				error,
				bot.locale.t('queue.error_logging_play', { trackId, userId })
			);
		}
	}

	/**
	 * Gets last played tracks for a user
	 * @param {string} userId - Discord user ID
	 * @param {number} [limit=10] - Number of tracks to return
	 * @returns {Promise<Track[]>} List of tracks
	 */
	public async getLastPlayedTracks(
		userId: string,
		limit: number = 10,
	): Promise<Track[]> {
		try {
			const historyEntries = await this.prisma.userHistory.findMany({
				where: { requestedBy: userId },
				orderBy: { playedAt: "desc" },
				take: limit,
				select: {
					trackId: true,
					info: true,
				},
			});

			return historyEntries.map(this.createBasicTrack);
		} catch (error) {
			this.handleError(
				error,
				bot.locale.t('queue.error_fetching_history', { userId })
			);
			return [];
		}
	}

	/**
	 * Gets top played tracks
	 * @param {number} [limit=10] - Number of tracks to return
	 * @returns {Promise<Track[]>} List of tracks
	 */
	public async getTopPlayedTracks(limit: number = 10): Promise<Track[]> {
		try {
			const topTracks = await this.prisma.globalHistory.groupBy({
				by: ["trackId", "info"],
				_sum: { playCount: true },
				orderBy: { _sum: { playCount: "desc" } },
				take: limit,
			});

			return topTracks.map(this.createBasicTrack);
		} catch (error) {
			this.handleError(
				error,
				bot.locale.t('queue.error_fetching_top_tracks')
			);
			return [];
		}
	}

	/**
	 * Adds multiple tracks to the queue
	 * @param {string} guildId - Discord guild ID
	 * @param {Omit<Track, 'id'>[]} tracks - Tracks to add
	 */
	public async setTracks(
		guildId: string,
		tracks: Omit<Track, "id">[],
	): Promise<void> {
		this.validateParams(guildId);
		if (!tracks.length)
			throw new QueueServiceError(
				bot.locale.t('queue.tracks_array_empty')
			);

		try {
			const validatedTracks = tracks.map((track) => TrackSchema.parse(track));
			const queue = await this.getOrCreateQueue(guildId);
			const existingTrackIds = await this.getExistingTrackIds(
				guildId,
				validatedTracks,
			);
			const newTracks = validatedTracks.filter(
				(track) => !existingTrackIds.has(track.trackId),
			);

			for (let i = 0; i < newTracks.length; i += QueueService.BATCH_SIZE) {
				const batch = newTracks.slice(i, i + QueueService.BATCH_SIZE);
				await this.addTrackBatch(batch, queue.id);
			}

			logger.info(
				bot.locale.t('queue.added_batch', { 
					count: newTracks.length,
					guildId 
				})
			);
		} catch (error) {
			this.handleError(error, bot.locale.t('queue.error_adding_tracks'));
		}
	}

	/**
	 * Validates the parameters for queue operations
	 * @param {string} channelId - Discord channel ID
	 * @param {string} guildId - Discord guild ID
	 * @param {string} trackId - Track ID
	 */
	private validateParams(
		channelId?: string,
		guildId?: string,
		trackId?: string,
	): void {
		if (
			channelId === undefined ||
			(guildId === undefined && trackId === undefined)
		) {
			throw new QueueServiceError(
				bot.locale.t('queue.missing_required_parameters')
			);
		}
	}

	/**
	 * Creates a track with a queue
	 * @param {any} prisma - Prisma client
	 * @param {Track} track - Track to create
	 * @param {string} guildId - Discord guild ID
	 */
	private async createTrackWithQueue(
		prisma: any,
		track: Track,
		guildId: string,
	): Promise<void> {
		const existingQueue = await prisma.queue.findUnique({
			where: { guildId },
		});

		if (existingQueue) {
			// Если очередь существует, просто добавляем трек к ней
			const existingTrack = await this.isTrackInQueue(
				prisma,
				track.trackId,
				guildId,
			);
			if (!existingTrack) {
				// Проверяем, существует ли трек
				await prisma.tracks.create({
					data: {
						...track,
						addedAt: BigInt(Date.now()),
						queueId: existingQueue.id,
					},
				});
			}
		} else {
			// Если очереди нет, создаем новую вместе с треком
			await prisma.queue.create({
				data: {
					guildId,
					waveStatus: false,
					loop: false,
					tracks: {
						create: {
							...track,
							addedAt: BigInt(Date.now()),
						},
					},
				},
			});
		}
	}

	private async updateGlobalHistory(
		prisma: any,
		trackId: string,
		trackName: string,
	): Promise<void> {
		const globalEntry = await prisma.globalHistory.findFirst({
			where: { trackId },
		});

		if (globalEntry) {
			await prisma.globalHistory.update({
				where: { id: globalEntry.id },
				data: {
					playCount: globalEntry.playCount + 1,
					playedAt: new Date(),
				},
			});
		} else {
			await prisma.globalHistory.create({
				data: { trackId, info: trackName },
			});
		}
	}

	private async updateUserHistory(
		prisma: any,
		userId: string,
		trackId: string,
		trackName: string,
	): Promise<void> {
		const userEntry = await prisma.userHistory.findFirst({
			where: {
				requestedBy: userId,
				trackId,
			},
		});

		if (userEntry) {
			await prisma.userHistory.update({
				where: { id: userEntry.id },
				data: {
					playCount: userEntry.playCount + 1,
					playedAt: new Date(),
				},
			});
		} else {
			await prisma.userHistory.create({
				data: {
					requestedBy: userId ?? "unknown",
					trackId,
					info: trackName,
				},
			});
		}
	}

	private createBasicTrack(track: { trackId: string; info: string }): Track {
		return {
			trackId: track.trackId,
			addedAt: BigInt(0),
			info: track.info,
			source: "",
			requestedBy: undefined,
		};
	}

	private createEmptyQueueResult(): QueueResult {
		return { tracks: [], waveStatus: false };
	}

	private async isTrackInQueue(
		prisma: Omit<
			PrismaClient,
			"$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
		>,
		trackId: string,
		guildId: string,
	): Promise<boolean> {
		const count = await prisma.tracks.count({
			where: {
				trackId,
				Queue: { guildId },
			},
		});
		return count > 0;
	}

	private mapQueueToQueueResult(
		queue: Queue & { tracks: Tracks[] },
	): QueueResult {
		return {
			tracks: queue.tracks.map(this.mapPrismaTrackToTrack),
			lastTrackId: queue.lastTrackId ?? undefined,
			waveStatus: queue.waveStatus ?? false,
			volume: queue.volume ?? undefined,
		};
	}

	private mapPrismaTrackToTrack(prismaTrack: Tracks): Track {
		return TrackSchema.parse({
			trackId: prismaTrack.trackId ?? "",
			addedAt: prismaTrack.addedAt ?? BigInt(0),
			info: prismaTrack.info ?? "",
			source: prismaTrack.source ?? "",
			requestedBy: prismaTrack.requestedBy ?? undefined,
		});
	}

	private handleError(error: unknown, message: string): void {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`${message}: ${errorMessage}`);

		if (
			error instanceof Error &&
			error.name === "PrismaClientKnownRequestError"
		) {
			throw new QueueServiceError("Database operation failed", error);
		}

		throw new QueueServiceError(message, error);
	}

	/**
	 * Gets or creates a queue for a channel
	 * @param {string} guildId - Discord guild ID
	 * @returns {Promise<Queue>} Queue object
	 */
	private async getOrCreateQueue(guildId: string): Promise<Queue> {
		return this.prisma.queue.upsert({
			where: { guildId },
			create: {
				guildId,
				waveStatus: false,
				loop: false,
			},
			update: {},
		});
	}

	/**
	 * Gets existing track IDs for a guild
	 * @param {string} guildId - Discord guild ID
	 * @param {Track[]} tracks - Tracks to check
	 * @returns {Promise<Set<string>>} Set of existing track IDs
	 */
	private async getExistingTrackIds(
		guildId: string,
		tracks: Track[],
	): Promise<Set<string>> {
		const existingTracks = await this.prisma.tracks.findMany({
			where: {
				Queue: { guildId },
				trackId: { in: tracks.map((t) => t.trackId) },
			},
			select: { trackId: true },
		});
		return new Set(existingTracks.map((t) => t.trackId));
	}

	/**
	 * Adds a batch of tracks to the queue
	 * @param {Track[]} tracks - Tracks to add
	 * @param {number} queueId - Queue ID
	 */
	private async addTrackBatch(tracks: Track[], queueId: number): Promise<void> {
		await this.prisma.tracks.createMany({
			data: tracks.map((track) => ({
				...track,
				addedAt: BigInt(Date.now()),
				queueId,
			})),
			skipDuplicates: true,
		});
		logger.info(
			bot.locale.t('queue.added_batch', { 
				count: tracks.length,
				queueId
			})
		);
	}
}
