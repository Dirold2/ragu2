import { TrackSchema } from "./index.js";
import { module } from "../module.js";
import { PrismaClient } from "#prisma/default.js";
import type { Queue, Tracks } from "#prisma/default.js";
import { QueueResult, Track } from "../interfaces/index.js";
/** Кастомный класс ошибок для QueueService */
class QueueServiceError extends Error {
	constructor(
		message: string,
		public details?: unknown,
	) {
		super(message);
		this.name = "QueueServiceError";
	}
}

// Расширяем интерфейс QueueResult для поддержки loop
interface EnhancedQueueResult extends QueueResult {
	loop?: boolean;
}

/**
 * Сервис для управления очередями музыки
 */
export default class QueueService {
	private readonly prisma = new PrismaClient();
	private static readonly DEFAULT_VOLUME = 10;
	private static readonly DEFAULT_TRANSACTION_TIMEOUT = 10000;
	private static readonly BATCH_SIZE = 50;

	// Добавляем кэш для оптимизации
	private readonly trackCache = new Map<string, Map<string, Track>>();
	private readonly queueCache = new Map<string, EnhancedQueueResult>();
	private readonly CACHE_TTL = 60000; // 1 минута

	private readonly logger = module.logger;
	private readonly locale = module.locale;

	constructor() {
		// Инициализируем Prisma с оптимизациями для Bun
		this.initializePrisma();
	}

	/**
	 * Инициализирует Prisma с оптимизациями для Bun
	 */
	private initializePrisma(): void {
		// Настраиваем логирование для Prisma
		this.prisma.$use(async (params, next) => {
			const before = Date.now();
			const result = await next(params);
			const after = Date.now();

			this.logger.debug(
				`Prisma query ${params.model}.${params.action} took ${after - before}ms`,
			);
			return result;
		});
	}

	/**
	 * Добавляет трек в очередь для конкретного сервера
	 */
	public async setTrack(
		guildId: string,
		track: Omit<Track, "id">,
	): Promise<void> {
		this.validateParams(guildId, track.trackId);

		try {
			const validatedTrack = TrackSchema.parse(track);

			// Используем транзакцию для атомарных операций
			await this.prisma.$transaction(
				async (txPrisma) => {
					const existingTrack = await this.isTrackInQueue(
						txPrisma,
						track.trackId,
						guildId,
					);
					if (!existingTrack) {
						await this.createTrackWithQueue(txPrisma, validatedTrack, guildId);

						// Инвалидируем кэш
						this.invalidateCache(guildId);
					}
				},
				{ timeout: QueueService.DEFAULT_TRANSACTION_TIMEOUT },
			);
		} catch (error) {
			this.handleError(
				error,
				module.locale.t("queue.error_adding_track", { trackId: track.trackId }),
			);
		}
	}

	/**
	 * Получает и удаляет следующий трек из очереди
	 */
	public async getTrack(guildId: string): Promise<Track | null> {
		if (!guildId)
			throw new QueueServiceError(module.locale.t("queue.guild_id_required"));

		try {
			// Проверяем кэш
			const guildCache = this.trackCache.get(guildId);
			if (guildCache && guildCache.size > 0) {
				// Получаем первый трек из кэша
				const entries = Array.from(guildCache.entries());
				if (entries.length > 0) {
					const [trackId, track] = entries[0];
					guildCache.delete(trackId);

					// Если кэш пуст, удаляем его
					if (guildCache.size === 0) {
						this.trackCache.delete(guildId);
					}

					// Удаляем трек из БД асинхронно
					this.prisma.tracks
						.deleteMany({
							where: { trackId, Queue: { guildId } },
						})
						.catch((error) => {
							this.logger.error(
								`Failed to delete track ${trackId} from database:`,
								error,
							);
						});

					return track;
				}
			}

			// Если кэш пуст, получаем из БД
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
				} else {
					this.logger.warn(
						`Track with ID ${nextTrack.id} not found for deletion.`,
					);
				}

				// Инвалидируем кэш очереди
				this.invalidateQueueCache(guildId);

				return this.mapPrismaTrackToTrack(nextTrack);
			});
		} catch (error) {
			this.handleError(
				error,
				module.locale.t("queue.error_retrieving_track", { guildId }),
			);
			return null;
		}
	}

	/**
	 * Получает следующий трек из очереди с приоритетом
	 */
	public async getTrackWithPriority(guildId: string): Promise<Track | null> {
		try {
			// Проверяем кэш на наличие приоритетных треков
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				for (const [trackId, track] of guildCache.entries()) {
					if (track.priority) {
						guildCache.delete(trackId);

						// Удаляем трек из БД асинхронно
						this.prisma.tracks
							.deleteMany({
								where: { trackId, Queue: { guildId } },
							})
							.catch((error) => {
								this.logger.error(
									`Failed to delete priority track ${trackId} from database:`,
									error,
								);
							});

						return track;
					}
				}
			}

			// Если в кэше нет приоритетных треков, ищем в БД
			const track = await this.prisma.tracks.findFirst({
				where: { Queue: { guildId }, priority: true },
				orderBy: { addedAt: "asc" },
			});

			if (!track) return null;

			await this.prisma.tracks.delete({ where: { id: track?.id } });

			// Инвалидируем кэш очереди
			this.invalidateQueueCache(guildId);

			return track ? this.mapPrismaTrackToTrack(track) : null;
		} catch (error) {
			this.logger.error(
				`Error getting priority track for guild ${guildId}:`,
				error,
			);
			return null;
		}
	}

	/**
	 * Получает текущее состояние очереди для канала
	 */
	public async getQueue(guildId: string): Promise<EnhancedQueueResult> {
		try {
			// Проверяем кэш
			if (this.queueCache.has(guildId)) {
				return this.queueCache.get(guildId)!;
			}

			const queue = await this.prisma.queue.findUnique({
				where: { guildId },
				include: {
					tracks: {
						orderBy: [{ priority: "desc" }, { addedAt: "asc" }],
					},
				},
			});

			const result = queue
				? this.mapQueueToQueueResult(queue)
				: this.createEmptyQueueResult();

			// Кэшируем результат
			this.queueCache.set(guildId, result);

			// Обновляем кэш треков
			if (queue) {
				const trackMap = new Map<string, Track>();
				for (const track of queue.tracks) {
					trackMap.set(track.trackId, this.mapPrismaTrackToTrack(track));
				}
				this.trackCache.set(guildId, trackMap);
			}

			// Устанавливаем TTL для кэша
			setTimeout(() => {
				this.queueCache.delete(guildId);
			}, this.CACHE_TTL);

			return result;
		} catch (error) {
			this.handleError(
				error,
				module.locale.t("queue.error_fetching_queue", { guildId }),
			);
			return this.createEmptyQueueResult();
		}
	}

	/**
	 * Устанавливает ID последнего воспроизведенного трека
	 */
	public async setLastTrackID(
		guildId: string,
		trackId?: string,
	): Promise<void> {
		try {
			await this.prisma.queue.updateMany({
				where: { guildId },
				data: { lastTrackId: trackId ?? null },
			});

			// Инвалидируем кэш очереди
			this.invalidateQueueCache(guildId);
		} catch (error) {
			this.logger.error(
				`Error setting last track ID for guild ${guildId}:`,
				error,
			);
		}
	}

	/**
	 * Получает ID последнего воспроизведенного трека
	 */
	public async getLastTrackID(guildId: string): Promise<string | null> {
		try {
			// Проверяем кэш
			if (this.queueCache.has(guildId)) {
				return this.queueCache.get(guildId)!.lastTrackId || null;
			}

			const queue = await this.prisma.queue.findFirst({
				where: { guildId },
				select: { lastTrackId: true },
			});
			return queue?.lastTrackId ?? null;
		} catch (error) {
			this.logger.error(
				`Error getting last track ID for guild ${guildId}:`,
				error,
			);
			return null;
		}
	}

	/**
	 * Очищает все треки из очереди
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

			// Очищаем кэш
			this.trackCache.delete(guildId);
			this.queueCache.delete(guildId);
		} catch (error) {
			this.handleError(
				error,
				module.locale.t("queue.error_clearing_queue", { guildId }),
			);
		}
	}

	/**
	 * Получает статус волны для сервера
	 */
	public async getWave(guildId: string): Promise<boolean> {
		try {
			// Проверяем кэш
			if (this.queueCache.has(guildId)) {
				return this.queueCache.get(guildId)!.waveStatus || false;
			}

			const queue = await this.prisma.queue.findFirst({
				where: { guildId },
				select: { waveStatus: true },
			});
			return queue?.waveStatus ?? false;
		} catch (error) {
			this.logger.error(
				`Error getting wave status for guild ${guildId}:`,
				error,
			);
			return false;
		}
	}

	/**
	 * Устанавливает статус волны для канала
	 */
	public async setWave(guildId: string, status: boolean): Promise<void> {
		try {
			await this.prisma.queue.updateMany({
				where: { guildId },
				data: { waveStatus: status },
			});

			// Обновляем кэш
			if (this.queueCache.has(guildId)) {
				const queueData = this.queueCache.get(guildId)!;
				queueData.waveStatus = status;
				this.queueCache.set(guildId, queueData);
			}
		} catch (error) {
			this.logger.error(
				`Error setting wave status for guild ${guildId}:`,
				error,
			);
		}
	}

	/**
	 * Подсчитывает музыкальные треки в очереди
	 */
	public async countMusicTracks(guildId: string): Promise<number> {
		try {
			// Проверяем кэш
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				return guildCache.size;
			}

			return this.prisma.tracks.count({
				where: { Queue: { guildId } },
			});
		} catch (error) {
			this.logger.error(`Error counting tracks for guild ${guildId}:`, error);
			return 0;
		}
	}

	/**
	 * Удаляет трек из очереди
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

			// Обновляем кэш
			const guildCache = this.trackCache.get(guildId);
			if (guildCache) {
				guildCache.delete(trackId);

				if (guildCache.size === 0) {
					this.trackCache.delete(guildId);
				}
			}

			// Инвалидируем кэш очереди
			this.invalidateQueueCache(guildId);
		} catch (error) {
			this.handleError(
				error,
				module.locale.t("queue.error_removing_track", { trackId }),
			);
		}
	}

	/**
	 * Получает громкость для сервера
	 */
	public async getVolume(guildId: string): Promise<number> {
		try {
			// Проверяем кэш
			if (this.queueCache.has(guildId)) {
				return (
					this.queueCache.get(guildId)!.volume || QueueService.DEFAULT_VOLUME
				);
			}

			const queue = await this.prisma.queue.findFirst({
				where: { guildId },
				select: { volume: true },
			});
			return queue?.volume ?? QueueService.DEFAULT_VOLUME;
		} catch (error) {
			this.logger.error(`Error getting volume for guild ${guildId}:`, error);
			return QueueService.DEFAULT_VOLUME;
		}
	}

	/**
	 * Устанавливает громкость для сервера
	 */
	public async setVolume(guildId: string, volume: number): Promise<void> {
		try {
			await this.prisma.queue.updateMany({
				where: { guildId },
				data: { volume: Number(volume) },
			});

			// Обновляем кэш
			if (this.queueCache.has(guildId)) {
				const queueData = this.queueCache.get(guildId)!;
				queueData.volume = volume;
				this.queueCache.set(guildId, queueData);
			}
		} catch (error) {
			this.logger.error(`Error setting volume for guild ${guildId}:`, error);
		}
	}

	/**
	 * Получает статус повтора для сервера
	 */
	public async getLoop(guildId: string): Promise<boolean> {
		try {
			// Проверяем кэш
			if (this.queueCache.has(guildId)) {
				return !!this.queueCache.get(guildId)!.loop;
			}

			const queue = await this.prisma.queue.findFirst({
				where: { guildId },
				select: { loop: true },
			});
			return queue?.loop ?? false;
		} catch (error) {
			this.logger.error(
				`Error getting loop status for guild ${guildId}:`,
				error,
			);
			return false;
		}
	}

	/**
	 * Устанавливает статус повтора для сервера
	 */
	public async setLoop(guildId: string, loop: boolean): Promise<void> {
		try {
			await this.prisma.queue.updateMany({
				where: { guildId },
				data: { loop },
			});

			// Обновляем кэш
			if (this.queueCache.has(guildId)) {
				const queueData = this.queueCache.get(guildId)!;
				queueData.loop = loop;
				this.queueCache.set(guildId, queueData);
			}

			this.logger.debug(this.locale.t("queue.loop_set", { guildId }));
		} catch (error) {
			this.logger.error(
				`Error setting loop status for guild ${guildId}:`,
				error,
			);
		}
	}

	/**
	 * Логирует воспроизведение трека в истории
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
				module.locale.t("queue.error_logging_play", { trackId, userId }),
			);
		}
	}

	/**
	 * Получает последние воспроизведенные треки для пользователя
	 */
	public async getLastPlayedTracks(
		userId: string,
		limit = 10,
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
				module.locale.t("queue.error_fetching_history", { userId }),
			);
			return [];
		}
	}

	/**
	 * Получает самые популярные треки
	 */
	public async getTopPlayedTracks(limit = 10): Promise<Track[]> {
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
				module.locale.t("queue.error_fetching_top_tracks"),
			);
			return [];
		}
	}

	/**
	 * Добавляет несколько треков в очередь
	 */
	public async setTracks(
		guildId: string,
		tracks: Omit<Track, "id">[],
	): Promise<void> {
		this.validateParams(guildId);
		if (!tracks.length)
			throw new QueueServiceError(module.locale.t("queue.tracks_array_empty"));

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

			// Используем Promise.all для параллельной обработки батчей
			const batches = [];
			for (let i = 0; i < newTracks.length; i += QueueService.BATCH_SIZE) {
				const batch = newTracks.slice(i, i + QueueService.BATCH_SIZE);
				batches.push(this.addTrackBatch(batch, queue.id));
			}

			await Promise.all(batches);

			// Обновляем кэш
			this.invalidateCache(guildId);

			this.logger.info(
				this.locale.t("queue.added_batch", {
					count: newTracks.length,
					guildId,
				}),
			);
		} catch (error) {
			this.handleError(error, module.locale.t("queue.error_adding_tracks"));
		}
	}

	/**
	 * Инвалидирует кэш для гильдии
	 */
	private invalidateCache(guildId: string): void {
		this.trackCache.delete(guildId);
		this.queueCache.delete(guildId);
	}

	/**
	 * Инвалидирует только кэш очереди
	 */
	private invalidateQueueCache(guildId: string): void {
		this.queueCache.delete(guildId);
	}

	/**
	 * Проверяет параметры для операций с очередью
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
				module.locale.t("queue.missing_required_parameters"),
			);
		}
	}

	/**
	 * Создает трек с очередью
	 */
	private async createTrackWithQueue(
		prisma: Omit<
			PrismaClient,
			"$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
		>,
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
		prisma: Omit<
			PrismaClient,
			"$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
		>,
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
		prisma: Omit<
			PrismaClient,
			"$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
		>,
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

	private createEmptyQueueResult(): EnhancedQueueResult {
		return { tracks: [], waveStatus: false, loop: false };
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
	): EnhancedQueueResult {
		return {
			tracks: queue.tracks.map(this.mapPrismaTrackToTrack),
			lastTrackId: queue.lastTrackId ?? undefined,
			waveStatus: queue.waveStatus ?? false,
			volume: queue.volume ?? undefined,
			loop: queue.loop ?? false,
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
		this.logger.error(`${message}: ${errorMessage}`);

		if (
			error instanceof Error &&
			error.name === "PrismaClientKnownRequestError"
		) {
			throw new QueueServiceError("Database operation failed", error);
		}

		throw new QueueServiceError(message, error);
	}

	/**
	 * Получает или создает очередь для канала
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
	 * Получает существующие ID треков для сервера
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
	 * Добавляет пакет треков в очередь
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
		this.logger.info(
			this.locale.t("queue.added_batch", {
				count: tracks.length,
				queueId,
			}),
		);
	}
}
