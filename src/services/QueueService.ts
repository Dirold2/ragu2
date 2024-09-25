import { PrismaClient, Tracks } from '@prisma/client';
import logger from '../utils/logger.js';
import NodeCache from 'node-cache';
import { QueueResult } from '../interfaces/index.js';
import { Track, TrackSchema } from './index.js';

// PrismaClientSingleton для избежания множественных соединений с базой данных
class PrismaClientSingleton {
    private static instance: PrismaClient;

    private constructor() {}

    public static getInstance(): PrismaClient {
        if (!PrismaClientSingleton.instance) {
            PrismaClientSingleton.instance = new PrismaClient();
        }
        return PrismaClientSingleton.instance;
    }
}

// Валидация треков через отдельный класс

class TrackValidator {
    public static validateTrack(track: Track): Track {
        return TrackSchema.parse(track);
    }
}



export default class QueueService {
    private prisma: PrismaClient;
    private cache: NodeCache;

    constructor() {
        this.prisma = PrismaClientSingleton.getInstance();
        this.cache = new NodeCache({ stdTTL: 600, checkperiod: 60 });
    }

    public async setTrack(channelId: string | null, guildId: string | null = '', track: Omit<Track, 'id'>, priority: boolean = false): Promise<void> {
        try {
            const validatedTrack = TrackValidator.validateTrack(track);

            await this.prisma.$transaction(async (prisma) => {
                // Проверяем, существует ли трек в очереди
                const existingTrack = await prisma.tracks.findFirst({
                    where: {
                        trackId: track.trackId,
                        Queue: { channelId: channelId ?? '' }
                    }
                });

                if (existingTrack) {
                    logger.info(`Track ${track.trackId} already exists in the queue. Skipping.`);
                    return;
                }

                // Создаём новый трек в базе данных
                await prisma.tracks.create({
                    data: {
                        ...validatedTrack,
                        addedAt: BigInt(Date.now()),
                        Queue: {
                            connectOrCreate: {
                                where: { channelId_priority: { channelId: channelId ?? '', priority } },
                                create: { channelId: channelId ?? '', guildId: guildId ?? '', priority }
                            }
                        }
                    }
                });
            });

            this.invalidateCache(channelId, priority);
        } catch (error) {
            logger.error(`Error adding track ${track.trackId} to queue in channel ${channelId}`, error);
            throw new Error('Failed to add track to queue');
        }
    }

    public async getTrack(channelId: string | null): Promise<Track | null> {
        try {
            const result = await this.prisma.$transaction(async (prisma) => {
                const nextTrack = await prisma.tracks.findFirst({
                    where: { Queue: { channelId: channelId ?? '' } },
                    orderBy: { addedAt: 'asc' }
                });
                if (!nextTrack) return null;

                // Удаляем трек из базы данных
                await prisma.tracks.delete({ where: { id: nextTrack.id } });
                return nextTrack;
            });

            if (!result) return null;

            this.invalidateCache(channelId);
            return TrackValidator.validateTrack(this.mapPrismaTrackToTrack(result));
        } catch (error) {
            logger.error(`Error getting next track from channel ${channelId}`, error);
            throw new Error('Failed to get next track');
        }
    }

    // Метод для получения следующего трека без его удаления
    public async peekNextTrack(channelId: string | null): Promise<Track | null> {
        try {
            const nextTrack = await this.prisma.tracks.findFirst({
                where: { Queue: { channelId: channelId ?? '' } },
                orderBy: { addedAt: 'asc' }
            });

            if (!nextTrack) return null;

            return TrackValidator.validateTrack(this.mapPrismaTrackToTrack(nextTrack));
        } catch (error) {
            logger.error(`Error peeking next track from channel ${channelId}`, error);
            throw new Error('Failed to get next track');
        }
    }

    public async getQueue(channelId: string, priority: boolean = false): Promise<QueueResult> {
        const cacheKey = `queue_${channelId}_${priority}`;
        const cachedQueue = this.cache.get<QueueResult>(cacheKey);

        if (!cachedQueue) {
            const queue = await this.fetchQueueFromDatabase(channelId, priority);
            this.cache.set(cacheKey, queue);
            return queue;
        }

        return cachedQueue;
    }

    private async fetchQueueFromDatabase(channelId: string, priority: boolean): Promise<QueueResult> {
        try {
            const queue = await this.prisma.queue.findUnique({
                where: {
                    channelId_priority: { channelId, priority },
                },
                include: { tracks: { orderBy: { addedAt: 'asc' } } }
            });

            return queue
                ? {
                    tracks: queue.tracks.map(this.mapPrismaTrackToTrack),
                    lastTrackId: queue.lastTrackId ?? undefined,
                    waveStatus: queue.waveStatus ?? undefined,
                    volume: queue.volume ?? undefined
                }
                : { tracks: [], waveStatus: false, lastTrackId: undefined, volume: undefined };
        } catch (error) {
            logger.error(`Error fetching queue from database for channel ${channelId}`, error);
            throw new Error('Failed to fetch queue from database');
        }
    }

    public async setLastTrackID(channelId: string, trackId: string | undefined): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { channelId },
            data: { lastTrackId: trackId }
        });
        this.invalidateCache(channelId);
    }

    public async getLastTrackID(channelId: string): Promise<string | null> {
        const queue = await this.prisma.queue.findFirst({ where: { channelId } });
        return queue?.lastTrackId ?? null;
    }

    public async clearQueue(channelId: string, priority: boolean = false): Promise<void> {
        await Promise.all([
            this.prisma.queue.update({
                where: {
                    channelId_priority: { channelId, priority },
                },
                data: { tracks: { deleteMany: {} }, lastTrackId: null }
            }),
            this.invalidateCache(channelId, priority)
        ]);
    }

    public async getWaveStatus(channelId: string): Promise<boolean> {
        const queue = await this.prisma.queue.findFirst({ where: { channelId } });
        return queue?.waveStatus ?? false;
    }

    public async setWaveStatus(channelId: string, status: boolean): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { channelId },
            data: { waveStatus: status }
        });
        this.invalidateCache(channelId);
    }

    public async countMusicTracks(channelId: string, priority: boolean = false): Promise<number> {
        return await this.prisma.tracks.count({
            where: { Queue: { channelId, priority } }
        });
    }

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

    private mapPrismaTrackToTrack(prismaTrack: Tracks): Track {
        return TrackValidator.validateTrack({
            trackId: prismaTrack.trackId,
            addedAt: prismaTrack.addedAt,
            info: prismaTrack.info,
            url: prismaTrack.url,
            source: prismaTrack.source
        });
    }

    private invalidateCache(channelId: string | null, priority?: boolean): void {
        this.cache.del(`queue_${channelId}_${priority}`);
        if (priority === undefined) {
            this.cache.del(`queue_${channelId}_true`);
            this.cache.del(`queue_${channelId}_false`);
        }
    }
}
