import { PrismaClient, Tracks } from '@prisma/client';
import { Logger } from 'winston';
import logger from './logger';
import NodeCache from 'node-cache';

export interface Track {
    trackId: number;
    addedAt?: bigint; // Changed from number | undefined to number | null
    info: string;
    url: string;
}

export class QueueService {
    private prisma: PrismaClient;
    private logger: Logger;
    private cache: NodeCache;

    constructor() {
        this.prisma = new PrismaClient();
        this.logger = logger;
        this.cache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes
    }

    /**
     * Adds a track to the queue for a specific channel.
     * @param {string} channelId - The ID of the channel.
     * @param {Omit<Track, 'id'>} track - The track to be added.
     * @param {boolean} [priority=false] - Whether to add to the priority queue.
     * @throws {Error} If the track cannot be added to the queue.
     * @returns {Promise<void>}
     */
    public async addTrack(channelId: string, track: Omit<Track, 'id'>, priority: boolean = false): Promise<void> {
        try {
            let queue = await this.prisma.queue.findFirst({ where: { channelId, priority } });
            if (!queue) {
                queue = await this.prisma.queue.create({
                data: { channelId, priority }
                });
            }
            await this.prisma.tracks.create({
                data: {
                ...track,
                addedAt: Date.now(),
                queue: { connect: { id: queue.id } }
                }
            });
            this.cache.del(`queue_${channelId}_${priority}`);
        } catch (error) {
            this.logger.error('Error adding track to queue:', error);
            throw new Error('Failed to add track to queue');
        }
    }

    /**
     * Retrieves the queue for a given channel.
     * @param {string} channelId - The ID of the channel.
     * @param {boolean} [priority=false] - Whether to get the priority queue.
     * @returns {Promise<{ tracks: Track[], lastTrackId?: number, waveStatus: boolean, volume?: number }>}
     */
    public async getQueue(channelId: string, priority: boolean = false): Promise<{ tracks: Track[], lastTrackId?: number, waveStatus: boolean, volume?: number }> {
        const cacheKey = `queue_${channelId}_${priority}`;
        const cachedQueue = this.cache.get(cacheKey);
        if (cachedQueue) {
          return cachedQueue as { tracks: Track[], lastTrackId?: number, waveStatus: boolean, volume?: number };
        }
    
        const queue = await this.prisma.queue.findFirst({
          where: { channelId, priority },
          include: { tracks: true }
        });
        if (!queue) {
          return { tracks: [], waveStatus: false };
        }
        const result = {
          tracks: queue.tracks.map(this.mapPrismaTrackToTrack),
          lastTrackId: queue.lastTrackId ?? undefined,
          waveStatus: queue.waveStatus,
          volume: queue.volume ?? undefined
        };
        this.cache.set(cacheKey, result);
        return result;
    }

    /**
     * Sets the last played track ID for a given channel's queue.
     * @param {string} channelId - The ID of the channel.
     * @param {number} trackId - The ID of the last played track.
     * @returns {Promise<void>}
     */
    public async setLastTrackID(channelId: string, trackId: number): Promise<void> {
        await this.prisma.queue.updateMany({
            where: { channelId },
            data: { lastTrackId: trackId }
        });
        this.cache.del(`queue_${channelId}_false`);
        this.cache.del(`queue_${channelId}_true`);
    }

    /**
     * Retrieves the last played track ID for a given channel's queue.
     * @param {string} channelId - The ID of the channel.
     * @returns {Promise<number | null>}
     */
    public async getLastTrackID(channelId: string): Promise<number | null> {
        const queue = await this.prisma.queue.findFirst({ where: { channelId } });
        return queue?.lastTrackId ?? null;
    }

    /**
     * Clears the track queue for a given channel.
     * @param {string} channelId - The ID of the channel.
     * @param {boolean} [priority=false] - Whether to clear the priority queue.
     * @returns {Promise<void>}
     */
    public async clearQueue(channelId: string, priority: boolean = false): Promise<void> {
        const queue = await this.prisma.queue.findFirst({ where: { channelId, priority } });
        if (queue) {
            await this.prisma.tracks.deleteMany({
                where: { queueId: queue.id }
            });
        }
        this.cache.del(`queue_${channelId}_${priority}`);
    }

    /**
     * Retrieves the next track from the queue for a given channel.
     * @param {string} channelId - The ID of the channel.
     * @returns {Promise<Track | null>} The next track or null if the queue is empty.
     */
    public async getNextTrack(channelId: string): Promise<Track | null> {
        try {
            const queue = await this.prisma.queue.findFirst({
                where: { channelId },
                include: { tracks: { take: 1 } }
            });
            if (!queue || queue.tracks.length === 0) {
                return null;
            }
            const nextTrack = queue.tracks[0];
            await this.prisma.tracks.delete({ where: { id: nextTrack.id } });
            this.cache.del(`queue_${channelId}_false`);
            this.cache.del(`queue_${channelId}_true`);
            return this.mapPrismaTrackToTrack(nextTrack);
        } catch (error) {
            this.logger.error('Error getting next track:', error);
            throw new Error('Failed to get next track');
        }
    }

    /**
     * Retrieves the wave status for a given channel.
     * @param {string} channelId - The ID of the channel.
     * @returns {Promise<boolean>} The wave status.
     */
    public async getWaveStatus(channelId: string): Promise<boolean> {
        try {
            const queue = await this.prisma.queue.findFirst({ where: { channelId } });
            return queue?.waveStatus ?? false;
        } catch (error) {
            this.logger.error('Error getting wave status:', error);
            throw new Error('Failed to get wave status');
        }
    }

    /**
     * Sets the wave status for a given channel.
     * @param {string} channelId - The ID of the channel.
     * @param {boolean} status - The wave status to set.
     * @returns {Promise<void>}
     */
    public async setWaveStatus(channelId: string, status: boolean): Promise<void> {
        try {
            await this.prisma.queue.updateMany({
                where: { channelId },
                data: { waveStatus: status }
            });
            this.cache.del(`queue_${channelId}_false`);
            this.cache.del(`queue_${channelId}_true`);
        } catch (error) {
            this.logger.error('Error setting wave status:', error);
            throw new Error('Failed to set wave status');
        }
    }

    /**
     * Counts the number of tracks in the queue for a given channel.
     * @param {string} channelId - The ID of the channel.
     * @param {boolean} [priority=false] - Whether to count tracks in the priority queue.
     * @returns {Promise<number>} The number of tracks in the queue.
     */
    public async countMusicTracks(channelId: string, priority: boolean = false): Promise<number> {
        try {
            const queue = await this.prisma.queue.findFirst({
                where: { channelId, priority },
                include: { _count: { select: { tracks: true } } }
            });
            return queue?._count.tracks ?? 0;
        } catch (error) {
            this.logger.error('Error counting music tracks:', error);
            throw new Error('Failed to count music tracks');
        }
    }

    /**
     * Clears all tracks from the queue for a given channel.
     * @param {string} channelId - The ID of the channel.
     * @param {boolean} [priority=false] - Whether to clear the priority queue.
     * @returns {Promise<void>}
     */
    public async clearTracksQueue(channelId: string, priority: boolean = false): Promise<void> {
        try {
            const queue = await this.prisma.queue.findFirst({ where: { channelId, priority } });
            if (queue) {
                await this.prisma.tracks.deleteMany({
                    where: { queueId: queue.id }
                });
                await this.prisma.queue.update({
                    where: { id: queue.id },
                    data: { lastTrackId: null }
                });
            }
            this.cache.del(`queue_${channelId}_${priority}`);
            this.logger.info(`Cleared tracks queue for channel ${channelId}, priority: ${priority}`);
        } catch (error) {
            this.logger.error('Error clearing tracks queue:', error);
            throw new Error('Failed to clear tracks queue');
        }
    }

    private mapPrismaTrackToTrack(prismaTrack: Tracks): Track {
        return {
            trackId: prismaTrack.trackId,
            addedAt: prismaTrack.addedAt ?? undefined,
            info: prismaTrack.info,
            url: prismaTrack.url,
        };
    }
}