import { QuickDB } from "quick.db";

export interface Track {
    id?: number;
    trackId: number;
    addedAt?: number;
    info: string;
    url: string;
}

export interface Queue {
    tracks: Track[];
    lastTrackId?: number;
    waveStatus?: boolean;
    volume?: number;
}

export class QueueService {
    private db: QuickDB;

    constructor() {
        this.db = new QuickDB();
    }

    private getQueueKey(channelId: string, priority: boolean = false): string {
        return `queue_${channelId}${priority ? '_priority' : ''}`;
    }

    private async setQueue(channelId: string, priority: boolean, queue: Queue): Promise<void> {
        const queueKey = this.getQueueKey(channelId, priority);
        await this.db.set(queueKey, queue);
    }

    async getQueue(channelId: string, priority: boolean = false): Promise<Queue> {
        const queueKey = this.getQueueKey(channelId, priority);
        return (await this.db.get(queueKey)) || { tracks: [] };
    }

    async updateQueue(channelId: string, priority: boolean, callback: (queue: Queue) => Queue): Promise<void> {
        const queue = await this.getQueue(channelId, priority);
        const updatedQueue = callback(queue);
        await this.setQueue(channelId, priority, updatedQueue);
    }

    async addTrack(channelId: string, track: Omit<Track, 'id'>, priority: boolean = false): Promise<void> {
        try {
            track.addedAt = Date.now();
            await this.updateQueue(channelId, priority, (queue) => {
                const id = (queue.tracks.length > 0 ? Math.max(...queue.tracks.map(t => t.id || 0)) : 0) + 1;
                const newTrack = { ...track, id };
                return { ...queue, tracks: [...queue.tracks, newTrack] };
            });
        } catch (error) {
            console.error('Error adding track to queue:', error);
        }
    }

    async getCurrentTrack(channelId: string): Promise<Track | null> {
        const queue = await this.getQueue(channelId);
        return queue.tracks.length > 0 ? queue.tracks[0] : null;
    }

    async setVolumeStatus(channelId: string, volume: number): Promise<void> {
        await this.updateQueue(channelId, false, (queue) => ({ ...queue, volume: volume }));
    }

    async getVolumeStatus(channelId: string): Promise<boolean> {
        const queue = await this.getQueue(channelId);
        return typeof queue.volume === 'number' ? queue.volume !== 0.03 : false;
    }

    async setWaveStatus(channelId: string, wave: boolean): Promise<void> {
        await this.updateQueue(channelId, false, (queue) => ({ ...queue, waveStatus: wave }));
    }

    async getWaveStatus(channelId: string): Promise<boolean> {
        const queue = await this.getQueue(channelId);
        return queue.waveStatus || false;
    }

    async setLastTrackID(channelId: string, trackId: number): Promise<void> {
        await this.updateQueue(channelId, false, (queue) => ({ ...queue, lastTrackId: trackId }));
    }

    async getLastTrackID(channelId: string): Promise<number | null> {
        const queue = await this.getQueue(channelId);
        return queue.lastTrackId || null;
    }

    async getNextTrack(channelId: string): Promise<Track | null> {
        const priorityQueue = await this.getQueue(channelId, true);
        if (priorityQueue.tracks.length > 0) {
            return this.shiftTrackFromQueue(channelId, true);
        }
        return this.shiftTrackFromQueue(channelId);
    }

    private async shiftTrackFromQueue(channelId: string, priority: boolean = false): Promise<Track | null> {
        const queue = await this.getQueue(channelId, priority);
        if (queue.tracks.length === 0) return null;

        queue.tracks.sort((a, b) => (a.id || 0) - (b.id || 0));
        const nextTrack = queue.tracks.shift();
        await this.setQueue(channelId, priority, { ...queue, tracks: queue.tracks });
        return nextTrack || null;
    }

    async clearQueue(channelId: string, priority: boolean = false): Promise<void> {
        await this.setQueue(channelId, priority, { tracks: [] });
    }

    async clearTracksQueue(channelId: string, priority: boolean = false): Promise<void> {
        const queue = await this.getQueue(channelId, priority);
        
        const newQueue: Queue = {
            tracks: [],
            lastTrackId: queue.lastTrackId,
            waveStatus: queue.waveStatus
        };
        
        await this.setQueue(channelId, priority, newQueue);
    }

    async countMusicTracks(channelId: string, priority: boolean = false): Promise<number> {
        const queue = await this.getQueue(channelId, priority);
        return queue.tracks.length;
    }

    async moveTrack(channelId: string, fromIndex: number, toIndex: number, priority: boolean = false): Promise<void> {
        const queue = await this.getQueue(channelId, priority);

        if (fromIndex < 0 || fromIndex >= queue.tracks.length || toIndex < 0 || toIndex >= queue.tracks.length) {
            throw new Error("Index out of range");
        }

        const [track] = queue.tracks.splice(fromIndex, 1);
        queue.tracks.splice(toIndex, 0, track);
        await this.setQueue(channelId, priority, { ...queue, tracks: queue.tracks });
    }

    async saveQueueState(channelId: string, stateKey: string): Promise<void> {
        const queue = await this.getQueue(channelId);
        const priorityQueue = await this.getQueue(channelId, true);
        await this.db.set(stateKey, { queue, priorityQueue });
    }

    async restoreQueueState(channelId: string, stateKey: string): Promise<void> {
        const state = (await this.db.get(stateKey)) || {};
        await this.setQueue(channelId, false, state.queue || { tracks: [] });
        await this.setQueue(channelId, true, state.priorityQueue || { tracks: [] });
    }
}