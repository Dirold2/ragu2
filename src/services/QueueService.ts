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
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    public async setTrack(channelId: string, guildId: string, track: Omit<Track, 'id'>, priority: boolean = false): Promise<void> {
        try {
            const validatedTrack = TrackSchema.parse(track);
            await this.prisma.$transaction(async (txPrisma) => {
                if (await this.isTrackInQueue(this.prisma, track.trackId, channelId)) return;

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
            if (!nextTrack) return null;

            await this.prisma.tracks.delete({ where: { id: nextTrack.id } });
            return this.mapPrismaTrackToTrack(nextTrack);
        } catch {
            return null;
        }
    }

    public async getQueue(channelId: string, priority: boolean = false): Promise<QueueResult> {
        try {
            const queue = await this.prisma.queue.findUnique({
                where: { channelId_priority: { channelId, priority } },
                include: { tracks: { orderBy: { addedAt: 'asc' } } }
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
        const queue = await this.prisma.queue.findFirst({ where: { channelId } });
        return queue?.lastTrackId ?? null;
    }

    public async clearQueue(channelId: string, priority: boolean = false): Promise<void> {
        try {
            await this.prisma.queue.update({
                where: { channelId_priority: { channelId, priority } },
                data: { tracks: { deleteMany: {} }, lastTrackId: null }
            });
        } catch (error) {
            this.handleError(error, `Error clearing queue for channel ${channelId}`);
        }
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
    }

    public async getVolume(guildId: string): Promise<number> {
        const queue = await this.prisma.queue.findFirst({ where: { guildId } });
        return queue?.volume ?? 10;
    }

    public async setVolume(guildId: string, volume: number): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { guildId },
            data: { volume: volume }
        });
    }

    private async isTrackInQueue(prisma: PrismaClient, trackId: string, channelId: string): Promise<boolean> {
        const existingTrack = await prisma.tracks.findFirst({
            where: { trackId, Queue: { channelId } }
        });
        return existingTrack !== null;
    }

    private async getNextTrackFromQueue(channelId: string): Promise<Tracks | null> {
        return await this.prisma.tracks.findFirst({
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
            trackId: prismaTrack.trackId,
            addedAt: prismaTrack.addedAt,
            info: prismaTrack.info,
            url: prismaTrack.url,
            source: prismaTrack.source
        });
    }

    private handleError(error: unknown, message: string): void {
        logger.error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
        throw new QueueServiceError(message, error);
    }
}