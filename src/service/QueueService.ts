import { PrismaClient, Tracks } from '@prisma/client';
import logger from '../utils/logger.js';
import NodeCache from 'node-cache';
import { z } from 'zod';

const TrackSchema = z.object({
    trackId: z.string(),
    addedAt: z.bigint().optional(),
    info: z.string(),
    url: z.string().url(),
    source: z.string(),
    waveStatus: z.boolean().optional()
});

interface QueueResult {
    tracks: Track[];
    lastTrackId?: string;
    waveStatus?: boolean;
    volume?: number;
}

type Track = z.infer<typeof TrackSchema>;

export class QueueService {
    private prisma: PrismaClient;
    private cache: NodeCache;

    constructor() {
        this.prisma = new PrismaClient();
        this.cache = new NodeCache({ stdTTL: 600 });
    }

    public async setTrack(
        channelId: string | null, 
        guildId: string | null = '',
        track: Omit<Track, 'id'>,
        priority: boolean = false
    ): Promise<void> {
        try {
            const validatedTrack = TrackSchema.parse(track);
            
            await this.prisma.$transaction(async (prisma) => {
                // Сначала проверяем, существует ли уже запись для этого сервера
                const existingTrack = await prisma.tracks.findFirst({
                    where: { Queue: { guildId: guildId ?? `` } }
                });
    
                if (existingTrack) {
                    // Если запись существует, обновляем её
                    await prisma.tracks.update({
                        where: { id: existingTrack.id },
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
                } else {
                    // Если записи нет, создаем новую
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
                }
            });
    
            this.invalidateCache(channelId, priority);
        } catch (error) {
            logger.error('Error adding track to queue:', error);
            throw new Error('Failed to add track to queue');
        }
    }

    public async getTrack(channelId: string | null): Promise<Track | null> {
        try {
            const result = await this.prisma.$transaction(async (prisma) => {
                const nextTrack = await prisma.tracks.findFirst({
                    where: { Queue: { channelId: channelId ?? '' } },
                    orderBy: { id: 'asc' }
                });
                if (!nextTrack) return null;
                
                await prisma.tracks.delete({ where: { id: nextTrack.id } });
                return nextTrack;
            });

            if (!result) return null;

            this.invalidateCache(channelId);
            return TrackSchema.parse(this.mapPrismaTrackToTrack(result));
        } catch (error) {
            logger.error('Error getting next track:', error);
            throw new Error('Failed to get next track');
        }
    }

    public async setGuildChannelId(guildId: string, channelId: string | null, priority: boolean = false): Promise<void> {
        try {
          await this.prisma.queue.upsert({
            where: { channelId_priority: { channelId: channelId ?? '', priority } },
            update: { channelId: channelId ?? '' },
            create: { guildId: guildId, channelId: channelId ?? '', priority}
          });
      
          this.invalidateCache(guildId);
        } catch (error) {
          logger.error('Error setting channel ID for guild:', error);
          throw new Error('Failed to set channel ID');
        }
    }

    public async getQueue(channelId: string, priority: boolean = false): Promise<QueueResult> {
        const cacheKey = `queue_${channelId}_${priority}`;
        const cachedQueue = this.cache.get<QueueResult>(cacheKey);
        if (cachedQueue) return cachedQueue;
    
        try {
            const queue = await this.prisma.queue.findUnique({
                where: {
                    channelId_priority: { channelId, priority },
                },
                include: { tracks: { orderBy: { id: `asc` } } }
            });
            const result: QueueResult = queue
                ? {
                    tracks: queue.tracks.map(this.mapPrismaTrackToTrack),
                    lastTrackId: queue.lastTrackId ?? undefined,
                    waveStatus: queue.waveStatus ?? undefined,
                    volume: queue.volume ?? undefined
                }
                : { tracks: [], waveStatus: false, lastTrackId: undefined, volume: undefined };
            
            this.cache.set(cacheKey, result);
            return result;
        } catch (error) {
            logger.error('Error getting queue:', error);
            throw new Error('Failed to get queue');
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
        await this.prisma.queue.update({
            where: {
                channelId_priority: { channelId, priority },
            },
            data: { tracks: { deleteMany: {} }, lastTrackId: null }
        });
        this.invalidateCache(channelId, priority);
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
        const result = await this.prisma.tracks.count({
            where: { Queue: { channelId, priority } }
        });
        return result;
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

    public async addMultipleTracks(channelId: string, tracks: Omit<Track, 'id'>[], priority: boolean = false): Promise<void> {
        try {
            const validatedTracks = tracks.map(track => TrackSchema.parse(track));
            await this.prisma.$transaction(async (prisma) => {
                await prisma.tracks.createMany({
                    data: validatedTracks.map(track => ({
                        ...track,
                        addedAt: BigInt(Date.now()),
                        Queue: {
                            connectOrCreate: {
                                where: { channelId_priority: { channelId, priority } },
                                create: { channelId, priority }
                            }
                        },
                        queueId: 1
                    }))
                });
            });
            this.invalidateCache(channelId, priority);
        } catch (error) {
            logger.error('Error adding multiple tracks to queue:', error);
            throw new Error('Failed to add multiple tracks to queue');
        }
    }

    private mapPrismaTrackToTrack(prismaTrack: Tracks): Track {
        return TrackSchema.parse({
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