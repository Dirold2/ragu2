import { PrismaClient, Queue, Tracks } from '@prisma/client';

import { QueueResult, Track } from '../interfaces/index.js';
import logger from '../utils/logger.js';
import { TrackSchema } from './index.js';

class QueueServiceError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'QueueServiceError';
  }
}

export default class QueueService {
    private readonly prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    public async setTrack(channelId: string, guildId: string, track: Omit<Track, 'id'>, priority: boolean = false): Promise<void> {
        try {
            const validatedTrack = TrackSchema.parse(track);
            await this.prisma.$transaction(async (txPrisma) => {
                if (await this.isTrackInQueue(txPrisma, track.trackId, channelId)) {
                    return;
                }

                await txPrisma.tracks.create({
                    data: {
                        ...validatedTrack,
                        addedAt: BigInt(Date.now()),
                        Queue: {
                            connectOrCreate: {
                                where: { channelId_priority: { channelId, priority } },
                                create: { channelId, guildId, priority }
                            }
                        }
                    }
                });
            });
        } catch (error) {
            this.handleError(error, `Error adding track ${track.trackId} to queue`);
        }
    }

    public async getTrack(channelId: string): Promise<Track | null> {
        try {
            const nextTrack = await this.getNextTrackFromQueue(channelId);
            if (!nextTrack) {
                return null;
            }

            const trackExists = await this.prisma.tracks.findUnique({ 
                where: { id: nextTrack.id } 
            });
            
            if (!trackExists) {
                throw new QueueServiceError(`Track with id ${nextTrack.id} does not exist`);
            }

            await this.prisma.tracks.delete({ 
                where: { id: nextTrack.id } 
            });

            return this.mapPrismaTrackToTrack(nextTrack);
        } catch (error) {
            this.handleError(error, `Error retrieving track from queue for channel ${channelId}`);
            return null;
        }
    }

    public async getQueue(channelId: string, priority: boolean = false): Promise<QueueResult> {
        try {
            const queue = await this.prisma.queue.findUnique({
                where: { 
                    channelId_priority: { channelId, priority } 
                },
                include: { 
                    tracks: { 
                        orderBy: { addedAt: 'asc' } 
                    } 
                }
            });

            return queue ? this.mapQueueToQueueResult(queue) : { tracks: [], waveStatus: false };
        } catch (error) {
            this.handleError(error, `Error fetching queue for channel ${channelId}`);
            return { tracks: [], waveStatus: false };
        }
    }

    public async setLastTrackID(channelId: string, trackId: string | undefined): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { channelId },
            data: { lastTrackId: trackId ?? null }
        });
    }

    public async getLastTrackID(channelId: string): Promise<string | null> {
        const queue = await this.prisma.queue.findFirst({ 
            where: { channelId },
            select: { lastTrackId: true }
        });
        return queue?.lastTrackId ?? null;
    }

    public async clearQueue(channelId: string, priority: boolean = false): Promise<void> {
        try {
            await this.prisma.queue.update({
                where: { channelId_priority: { channelId, priority } },
                data: { 
                    tracks: { deleteMany: {} },
                    lastTrackId: null 
                }
            });
        } catch (error) {
            this.handleError(error, `Error clearing queue for channel ${channelId}`);
        }
    }

    public async getWaveStatus(channelId: string): Promise<boolean> {
        const queue = await this.prisma.queue.findFirst({ 
            where: { channelId },
            select: { waveStatus: true }
        });
        return queue?.waveStatus ?? false;
    }

    public async setWaveStatus(channelId: string, status: boolean): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { channelId },
            data: { waveStatus: status }
        });
    }

    public async countMusicTracks(channelId: string, priority: boolean = false): Promise<number> {
        return this.prisma.tracks.count({
            where: { Queue: { channelId, priority } }
        });
    }

    public async removeTrack(channelId: string, trackId: string): Promise<void> {
        try {
            await this.prisma.$transaction(async (prisma) => {
                const track = await prisma.tracks.findFirst({
                    where: { 
                        trackId,
                        Queue: { channelId } 
                    },
                    select: { id: true }
                });

                if (track) {
                    await prisma.tracks.delete({ 
                        where: { id: track.id } 
                    });
                }
            });
        } catch (error) {
            this.handleError(error, `Error removing track ${trackId} from queue for channel ${channelId}`);
        }
    }

    public async getVolume(guildId: string): Promise<number> {
        const queue = await this.prisma.queue.findFirst({ 
            where: { guildId },
            select: { volume: true }
        });
        return queue?.volume ?? 10;
    }

    public async setVolume(guildId: string, volume: number): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { guildId },
            data: { volume }
        });
    }

    public async getLoop(guildId: string): Promise<boolean> {
        const queue = await this.prisma.queue.findFirst({ 
            where: { guildId },
            select: { loop: true }
        });
        return queue?.loop ?? false;
    }

    public async setLoop(guildId: string, loop: boolean): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { guildId },
            data: { loop }
        });
    }

    public async logTrackPlay(userId: string, trackId: string, trackName: string): Promise<void> {
        try {
            await this.prisma.$transaction(async (prisma) => {
                const globalEntry = await prisma.globalHistory.findFirst({
                    where: { trackId }
                });

                if (globalEntry) {
                    await prisma.globalHistory.update({
                        where: { id: globalEntry.id },
                        data: { 
                            playCount: globalEntry.playCount + 1,
                            playedAt: new Date() 
                        }
                    });
                } else {
                    await prisma.globalHistory.create({
                        data: { trackId, info: trackName }
                    });
                }

                const userEntry = await prisma.userHistory.findFirst({
                    where: { 
                        requestedBy: userId,
                        trackId 
                    }
                });

                if (userEntry) {
                    await prisma.userHistory.update({
                        where: { id: userEntry.id },
                        data: { 
                            playCount: userEntry.playCount + 1,
                            playedAt: new Date() 
                        }
                    });
                } else {
                    await prisma.userHistory.create({
                        data: { 
                            requestedBy: userId,
                            trackId,
                            info: trackName 
                        }
                    });
                }
            });
        } catch (error) {
            this.handleError(error, `Error logging play for track ${trackId} by user ${userId}`);
        }
    }

    public async getLastPlayedTracks(userId: string, limit: number = 10): Promise<Track[]> {
        try {
            const historyEntries = await this.prisma.userHistory.findMany({
                where: { requestedBy: userId },
                orderBy: { playedAt: 'desc' },
                take: limit,
                select: {
                    trackId: true,
                    info: true
                }
            });

            return historyEntries.map(track => ({
                trackId: track.trackId,
                addedAt: BigInt(0),
                info: track.info,
                url: '',
                source: '',
                requestedBy: undefined
            }));
        } catch (error) {
            this.handleError(error, `Error fetching last played tracks for user ${userId}`);
            return [];
        }
    }

    public async getTopPlayedTracks(limit: number = 10): Promise<Track[]> {
        try {
            const topTracks = await this.prisma.globalHistory.groupBy({
                by: ['trackId', 'info'],
                _sum: { playCount: true },
                orderBy: { _sum: { playCount: 'desc' } },
                take: limit
            });

            return topTracks.map(track => ({
                trackId: track.trackId,
                addedAt: BigInt(0),
                info: track.info,
                url: '',
                source: '',
                requestedBy: undefined
            }));
        } catch (error) {
            this.handleError(error, `Error fetching top played tracks`);
            return [];
        }
    }

    private async isTrackInQueue(prisma: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">, trackId: string, channelId: string): Promise<boolean> {
        const existingTrack = await prisma.tracks.findFirst({
            where: { 
                trackId,
                Queue: { channelId } 
            },
            select: { id: true }
        });
        return !!existingTrack;
    }

    private async getNextTrackFromQueue(channelId: string): Promise<Tracks | null> {
        return this.prisma.tracks.findFirst({
            where: { Queue: { channelId } },
            orderBy: { addedAt: 'asc' }
        });
    }

    private mapQueueToQueueResult(queue: Queue & { tracks: Tracks[] }): QueueResult {
        return {
            tracks: queue.tracks.map(this.mapPrismaTrackToTrack),
            lastTrackId: queue.lastTrackId ?? undefined,
            waveStatus: queue.waveStatus ?? false,
            volume: queue.volume ?? undefined
        };
    }

    private mapPrismaTrackToTrack(prismaTrack: Tracks): Track {
        return TrackSchema.parse({
            trackId: prismaTrack.trackId ?? '',
            addedAt: prismaTrack.addedAt ?? BigInt(0),
            info: prismaTrack.info ?? '',
            url: prismaTrack.url ?? '',
            source: prismaTrack.source ?? '',
            requestedBy: prismaTrack.requestedBy ?? null    
        });
    }

    private handleError(error: unknown, message: string): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`${message}: ${errorMessage}`);
        throw new QueueServiceError(message, error);
    }
}