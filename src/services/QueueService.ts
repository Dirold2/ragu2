import NodeCache from 'node-cache';
import { Prisma, PrismaClient, Queue, Tracks } from '@prisma/client';
import { QueueResult } from '../interfaces/index.js';
import logger from '../utils/logger.js';
import { Track, TrackSchema } from './index.js';

interface QueueWithTracks extends Queue {
    tracks: Tracks[];
}

// Простой синглтон для PrismaClient
class PrismaClientSingleton {
    private static instance: PrismaClient;

    private constructor() { }

    public static getInstance(): PrismaClient {
        if (!PrismaClientSingleton.instance) {
            PrismaClientSingleton.instance = new PrismaClient();
        }
        return PrismaClientSingleton.instance;
    }
}

// Класс для валидации треков
class TrackValidator {
    public static validateTrack(track: Track): Track {
        return TrackSchema.parse(track);
    }
}

class QueueServiceError extends Error {
    constructor(message: string, public details?: unknown) {
        super(message);
    }
}

export default class QueueService {
    private prisma: PrismaClient = PrismaClientSingleton.getInstance();
    private cache: NodeCache = new NodeCache({ stdTTL: 600, checkperiod: 60 });

    // Добавление трека в очередь
    public async setTrack(channelId: string | null, guildId: string = '', track: Omit<Track, 'id'>, priority: boolean = false): Promise<void> {
        this.validateChannelId(channelId);
        try {
            const validatedTrack = TrackValidator.validateTrack(track);
            await this.prisma.$transaction(async (txPrisma: PrismaClient) => {
                // Проверяем, есть ли трек в очереди
                if (await this.isTrackInQueue(txPrisma, track.trackId, channelId)) return;

                // Добавляем трек в базу данных
                await txPrisma.tracks.create({
                    data: {
                        ...validatedTrack,
                        addedAt: BigInt(Date.now()),
                        Queue: {
                            connectOrCreate: {
                                where: { channelId_priority: { channelId: channelId ?? '', priority } },
                                create: { channelId: channelId ?? '', guildId, priority }
                            }
                        }
                    }
                });
            }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

            this.invalidateCache(channelId, priority);
        } catch (error) {
            this.handleError(error, `Error adding track ${track.trackId} to queue`);
        }
    }

    // Проверка, существует ли трек в очереди
    private async isTrackInQueue(prisma: PrismaClient, trackId: string, channelId: string | null): Promise<boolean> {
        this.validateChannelId(channelId);
        const existingTrack = await prisma.tracks.findFirst({
            where: { trackId, Queue: { channelId: channelId ?? '' } }
        });
        return existingTrack !== null;
    }

    // Получение следующего трека
    public async getTrack(channelId: string | null): Promise<Track | null> {
        this.validateChannelId(channelId);
        try {
            const nextTrack = await this.getNextTrackFromQueue(channelId);
            if (!nextTrack) return null;

            // Проверяем наличие трека в базе данных
            const trackExists = await this.prisma.tracks.findFirst({
                where: { id: nextTrack.id },
                select: { id: true }
            });

            if (!trackExists) {
                logger.error(`Track with id ${nextTrack.id} does not exist`);
                throw new Error(`Track does not exist`);
            }

            // Удаляем трек из базы данных
            await this.prisma.tracks.delete({ where: { id: nextTrack.id } });

            this.invalidateCache(channelId);
            return TrackValidator.validateTrack(this.mapPrismaTrackToTrack(nextTrack));
        } catch (error) {
            this.handleError(error, `Error getting next track from channel ${channelId}`);
            return null;
        }
    }

    // Получение следующего трека без его удаления
    public async peekNextTrack(channelId: string | null): Promise<Track | null> {
        this.validateChannelId(channelId);
        try {
            const nextTrack = await this.getNextTrackFromQueue(channelId);
            if (!nextTrack) return null;

            return TrackValidator.validateTrack(this.mapPrismaTrackToTrack(nextTrack));
        } catch (error) {
            this.handleError(error, `Error peeking next track from channel ${channelId}`);
            return null;
        }
    }

    // Метод для получения следующего трека из очереди
    private async getNextTrackFromQueue(channelId: string | null): Promise<Tracks | null> {
        this.validateChannelId(channelId);
        return await this.prisma.tracks.findFirst({
            where: { Queue: { channelId: channelId ?? '' } },
            orderBy: { addedAt: 'asc' }
        });
    }

    // Получение очереди, с кешированием
    public async getQueue(channelId: string, priority: boolean = false): Promise<QueueResult> {
        const cacheKey = `queue_${channelId}_${priority}`;
        const cachedQueue = this.cache.get<QueueResult>(cacheKey);

        if (cachedQueue) return cachedQueue;

        const queue = await this.fetchQueueFromDatabase(channelId, priority);
        this.cache.set(cacheKey, queue);
        return queue;
    }

    // Получение очереди из базы данных
    private async fetchQueueFromDatabase(channelId: string, priority: boolean): Promise<QueueResult> {
        try {
            const queue = await this.prisma.queue.findUnique({
                where: { channelId_priority: { channelId, priority } },
                include: { tracks: { orderBy: { addedAt: 'asc' } } }
            });

            return queue ? this.mapQueueToQueueResult(queue) : { tracks: [], waveStatus: false };
        } catch (error) {
            this.handleError(error, `Error fetching queue from database for channel ${channelId}`);
            return { tracks: [], waveStatus: false };
        }
    }

    // Преобразование очереди из базы данных в нужный формат
    private mapQueueToQueueResult(queue: QueueWithTracks): QueueResult {
        return {
            tracks: queue.tracks.map(this.mapPrismaTrackToTrack),
            lastTrackId: queue.lastTrackId ?? undefined,
            waveStatus: queue.waveStatus ?? false,
            volume: queue.volume ?? undefined
        };
    }

    // Преобразование трека из Prisma в Track
    private mapPrismaTrackToTrack(prismaTrack: Tracks): Track {
        return TrackValidator.validateTrack({
            trackId: prismaTrack.trackId,
            addedAt: prismaTrack.addedAt,
            info: prismaTrack.info,
            url: prismaTrack.url,
            source: prismaTrack.source
        });
    }

    // Очистка кеша
    private invalidateCache(channelId: string | null, priority: boolean = false): void {
        this.validateChannelId(channelId);
        this.cache.del(`queue_${channelId}_${priority}`);

        if (priority === undefined) {
            this.cache.del(`queue_${channelId}_true`);
            this.cache.del(`queue_${channelId}_false`);
        }
    }

    // Обработка ошибок
    private handleError(error: Error, message: string): void {
        logger.error(`${message}: ${error.message}`);
        throw new QueueServiceError(message, error);
    }

    // Установка последнего трека
    public async setLastTrackID(channelId: string, trackId: string | undefined): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { channelId },
            data: { lastTrackId: trackId ?? null }
        });
        this.invalidateCache(channelId);
    }

    // Получение последнего трека
    public async getLastTrackID(channelId: string): Promise<string | null> {
        const queue = await this.prisma.queue.findFirst({ where: { channelId } });
        return queue?.lastTrackId ?? null;
    }

    // Очистка очереди
    public async clearQueue(channelId: string, priority: boolean = false): Promise<void> {
        try {
            await this.prisma.queue.update({
                where: {
                    channelId_priority: { channelId, priority },
                },
                data: { tracks: { deleteMany: {} }, lastTrackId: null }
            });
            this.invalidateCache(channelId, priority);
        } catch (error) {
            this.handleError(error, `Error clearing queue for channel ${channelId}`);
        }
    }

    // Получение статуса волны
    public async getWaveStatus(channelId: string): Promise<boolean> {
        const queue = await this.prisma.queue.findFirst({ where: { channelId } });
        return queue?.waveStatus ?? false;
    }

    // Установка статуса волны
    public async setWaveStatus(channelId: string, status: boolean): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { channelId },
            data: { waveStatus: status }
        });
        this.invalidateCache(channelId);
    }

    // Подсчет треков в очереди
    public async countMusicTracks(channelId: string, priority: boolean = false): Promise<number> {
        return await this.prisma.tracks.count({
            where: { Queue: { channelId, priority } }
        });
    }

    // Удаление трека из очереди
    public async removeTrack(channelId: string, trackId: string): Promise<void> {
        await this.prisma.$transaction(async (prisma) => {
            const track = await prisma.tracks.findFirst({
                where: { trackId, Queue: { channelId } }
            });
            if (track) {
                await prisma.tracks.delete({ where: { id: track.id } });
            }
        });
        this.invalidateCache(channelId);
    }

    // Получение громкости
    public async getVolume(guildId: string): Promise<number> {
        const queue = await this.prisma.queue.findFirst({ where: { guildId } });
        return queue?.volume ?? 10;
    }

    // Установка громкости
    public async setVolume(guildId: string, volume: number): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { guildId },
            data: { volume: volume }
        });
    }

    private validateChannelId(channelId?: string | null): void {
        if (!channelId) logger.error('Channel ID is required');
    }
}