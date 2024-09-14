import { QuickDB } from "quick.db";
import { Logger, ILogObj } from "tslog";

/**
 * Track interface represents the structure of individual tracks.
 * @property {number} [id] - Optional track identifier.
 * @property {number} trackId - Required unique identifier for each track.
 * @property {number} [addedAt] - Optional timestamp when the track was added.
 * @property {string} info - Information related to the track.
 * @property {string} url - URL of the track.
 */
export interface Track {
    id?: number;
    trackId: number;
    addedAt?: number;
    info: string;
    url: string;
}

/**
 * Queue interface represents the structure of track queues.
 * @property {Track[]} tracks - Array of track objects.
 * @property {number} [lastTrackId] - Identifier of the last played track.
 * @property {boolean} [waveStatus] - Status of the wave playback.
 * @property {number} [volume] - Volume level of the queue.
 */
export interface Queue {
    tracks: Track[];
    lastTrackId?: number;
    waveStatus?: boolean;
    volume?: number;
}

export class QueueService {
    private db: QuickDB;
    private logger: Logger<ILogObj>;

    /**
     * Instantiates a new QueueService with a QuickDB instance and logger.
     */
    constructor() {
        this.db = new QuickDB();
        this.logger = new Logger();
    }

    /**
     * Constructs a key for a given queue based on channelId and priority.
     * @private
     * @param {string} channelId - The unique channel identifier.
     * @param {boolean} [priority=false] - Optional flag for priority queue.
     * @returns {string} - Returns the constructed queue key.
     */
    private getQueueKey(channelId: string, priority: boolean = false): string {
        return `queue_${channelId}${priority ? '_priority' : ''}`;
    }

    /**
     * Sets the given queue object for a specific channel in the database.
     * @private
     * @param {string} channelId - The unique channel identifier.
     * @param {boolean} priority - Flag for priority queue.
     * @param {Queue} queue - The queue object to be set.
     * @returns {Promise<void>} - Returns a promise that resolves when set is complete.
     */
    private async setQueue(channelId: string, priority: boolean, queue: Queue): Promise<void> {
        const queueKey = this.getQueueKey(channelId, priority);
        await this.db.set(queueKey, queue);
    }

    /**
     * Retrieves the queue for a given channel from the database.
     * @param {string} channelId - The unique channel identifier.
     * @param {boolean} [priority=false] - Optional flag for priority queue.
     * @returns {Promise<Queue>} - Returns the queue object.
     */
    public async getQueue(channelId: string, priority: boolean = false): Promise<Queue> {
        const queueKey = this.getQueueKey(channelId, priority);
        return await this.db.get<Queue>(queueKey) ?? { tracks: [] };
    }

    /**
     * Updates the queue for a specific channel by applying the given callback.
     * @private
     * @param {string} channelId - The unique channel identifier.
     * @param {boolean} priority - Flag for priority queue.
     * @param {(queue: Queue) => Queue} callback - Function to modify the queue object.
     * @returns {Promise<void>} - Returns a promise that resolves when the update is complete.
     */
    private async updateQueue(channelId: string, priority: boolean, callback: (queue: Queue) => Queue): Promise<void> {
        const queue = await this.getQueue(channelId, priority);
        const updatedQueue = callback(queue);
        await this.setQueue(channelId, priority, updatedQueue);
    }

    /**
     * Adds a track to the queue for a given channel.
     * @param {string} channelId - The unique channel identifier.
     * @param {Omit<Track, 'id'>} track - Track object excluding the ID.
     * @param {boolean} [priority=false] - Optional flag for priority queue.
     * @returns {Promise<void>} - Returns a promise that resolves when the track is added.
     */
    public async addTrack(channelId: string, track: Omit<Track, 'id'>, priority: boolean = false): Promise<void> {
        try {
            await this.updateQueue(channelId, priority, (queue) => {
                const id = queue.tracks.length > 0 ? Math.max(...queue.tracks.map(t => t.id ?? 0)) + 1 : 1;
                const newTrack: Track = { ...track, id, addedAt: Date.now() };
                return { ...queue, tracks: [...queue.tracks, newTrack] };
            });
        } catch (error) {
            this.logger.error('Error adding track to queue:', error);
            throw new Error('Failed to add track to queue');
        }
    }

    /**
     * Retrieves the current track for a given channel.
     * @param {string} channelId - The unique channel identifier.
     * @returns {Promise<Track | null>} - Returns the first track object or null.
     */
    public async getCurrentTrack(channelId: string): Promise<Track | null> {
        const queue = await this.getQueue(channelId);
        return queue.tracks[0] ?? null;
    }

    /**
     * Updates the volume status for a channel's queue.
     * @param {string} channelId - The unique channel identifier.
     * @param {number} volume - Volume level to be set.
     * @returns {Promise<void>} - Returns a promise that resolves when the volume status is updated.
     */
    public async setVolumeStatus(channelId: string, volume: number): Promise<void> {
        await this.updateQueue(channelId, false, (queue) => ({ ...queue, volume }));
    }

    /**
     * Retrieves the volume status of a given channel's queue.
     * @param {string} channelId - The unique channel identifier.
     * @returns {Promise<boolean>} - Returns the boolean status of the volume.
     */
    public async getVolumeStatus(channelId: string): Promise<boolean> {
        const queue = await this.getQueue(channelId);
        return queue.volume !== undefined && queue.volume !== 0.03;
    }

    /**
     * Updates the wave status for a channel's queue.
     * @param {string} channelId - The unique channel identifier.
     * @param {boolean} wave - The wave status to be set.
     * @returns {Promise<void>} - Returns a promise that resolves when the wave status is updated.
     */
    public async setWaveStatus(channelId: string, wave: boolean): Promise<void> {
        await this.updateQueue(channelId, false, (queue) => ({ ...queue, waveStatus: wave }));
    }

    /**
     * Retrieves the wave status of a given channel's queue.
     * @param {string} channelId - The unique channel identifier.
     * @returns {Promise<boolean>} - Returns the boolean status of the wave.
     */
    public async getWaveStatus(channelId: string): Promise<boolean> {
        const queue = await this.getQueue(channelId);
        return queue.waveStatus ?? false;
    }

    /**
     * Sets the last played track ID for a given channel's queue.
     * @param {string} channelId - The unique channel identifier.
     * @param {number} trackId - The ID of the last played track.
     * @returns {Promise<void>} - Returns a promise that resolves when the last track ID is set.
     */
    public async setLastTrackID(channelId: string, trackId: number): Promise<void> {
        await this.updateQueue(channelId, false, (queue) => ({ ...queue, lastTrackId: trackId }));
    }

    /**
     * Retrieves the last played track ID for a given channel's queue.
     * @param {string} channelId - The unique channel identifier.
     * @returns {Promise<number | null>} - Returns the last played track ID or null.
     */
    public async getLastTrackID(channelId: string): Promise<number | null> {
        const queue = await this.getQueue(channelId);
        return queue.lastTrackId ?? null;
    }

    /**
     * Retrieves and removes the next track from the queue for a given channel.
     * This will prioritize the priority queue if available.
     * @param {string} channelId - The unique channel identifier.
     * @returns {Promise<Track | null>} - Returns the next track or null.
     */
    public async getNextTrack(channelId: string): Promise<Track | null> {
        const priorityQueue = await this.getQueue(channelId, true);
        if (priorityQueue.tracks.length > 0) {
            return this.shiftTrackFromQueue(channelId, true);
        }
        return this.shiftTrackFromQueue(channelId);
    }

    /**
     * Removes and returns the first track from the queue.
     * @private
     * @param {string} channelId - The unique channel identifier.
     * @param {boolean} [priority=false] - Optional flag for priority queue.
     * @returns {Promise<Track | null>} - Returns the shifted track or null.
     */
    private async shiftTrackFromQueue(channelId: string, priority: boolean = false): Promise<Track | null> {
        const queue = await this.getQueue(channelId, priority);
        if (queue.tracks.length === 0) return null;

        queue.tracks.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
        const [nextTrack, ...remainingTracks] = queue.tracks;
        await this.setQueue(channelId, priority, { ...queue, tracks: remainingTracks });
        return nextTrack;
    }
    /**
     * Clears the track queue for a given channel.
     * @param {string} channelId - The unique channel identifier.
     * @param {boolean} [priority=false] - Optional flag for priority queue.
     * @returns {Promise<void>} - Returns a promise that resolves once the queue is cleared.
     */
    public async clearQueue(channelId: string, priority: boolean = false): Promise<void> {
        await this.setQueue(channelId, priority, { tracks: [] });
    }

    /**
     * Clears the tracks in the queue but retains the last track ID and wave status.
     * @param {string} channelId - The unique channel identifier.
     * @param {boolean} [priority=false] - Optional flag for priority queue.
     * @returns {Promise<void>} - Returns a promise that resolves once the tracks in queue are cleared.
     */
    public async clearTracksQueue(channelId: string, priority: boolean = false): Promise<void> {
        const queue = await this.getQueue(channelId, priority);
        const { lastTrackId, waveStatus } = queue;
        await this.setQueue(channelId, priority, { tracks: [], lastTrackId, waveStatus });
    }

    /**
     * Counts the number of tracks in the queue for a given channel.
     * @param {string} channelId - The unique channel identifier.
     * @param {boolean} [priority=false] - Optional flag for priority queue.
     * @returns {Promise<number>} - Returns the number of tracks in the queue.
     */
    public async countMusicTracks(channelId: string, priority: boolean = false): Promise<number> {
        const queue = await this.getQueue(channelId, priority);
        return queue.tracks.length;
    }

    /**
     * Moves a track from one index to another within the queue.
     * @param {string} channelId - The unique channel identifier.
     * @param {number} fromIndex - The index of the track to move.
     * @param {number} toIndex - The index where the track should be moved.
     * @param {boolean} [priority=false] - Optional flag for priority queue.
     * @returns {Promise<void>} - Returns a promise that resolves after the track is moved.
     * @throws {Error} - Throws an error if an index is out of range.
     */
    public async moveTrack(channelId: string, fromIndex: number, toIndex: number, priority: boolean = false): Promise<void> {
        await this.updateQueue(channelId, priority, (queue) => {
            if (fromIndex < 0 || fromIndex >= queue.tracks.length || toIndex < 0 || toIndex >= queue.tracks.length) {
                throw new Error("Index out of range");
            }
            const [track] = queue.tracks.splice(fromIndex, 1);
            queue.tracks.splice(toIndex, 0, track);
            return queue;
        });
    }

    /**
     * Saves the current state of both the normal and priority queue.
     * @param {string} channelId - The unique channel identifier.
     * @param {string} stateKey - The key to be used for saving the queue state.
     * @returns {Promise<void>} - Returns a promise that resolves after the queue state is saved.
     */
    public async saveQueueState(channelId: string, stateKey: string): Promise<void> {
        const queue = await this.getQueue(channelId);
        const priorityQueue = await this.getQueue(channelId, true);
        await this.db.set(stateKey, { queue, priorityQueue });
    }

    /**
     * Restores the queue state for both normal and priority queues for a given channel.
     * If no state is found, the queues are cleared.
     * @param {string} channelId - The unique channel identifier.
     * @param {string} stateKey - The key where the queue state is saved.
     * @returns {Promise<void>} - Returns a promise that resolves after the queue state is restored or queues are cleared.
     */
    public async restoreQueueState(channelId: string, stateKey: string): Promise<void> {
        const state = await this.db.get<{ queue: Queue; priorityQueue: Queue }>(stateKey);
        if (state) {
            await this.setQueue(channelId, false, state.queue);
            await this.setQueue(channelId, true, state.priorityQueue);
        } else {
            await this.clearQueue(channelId);
            await this.clearQueue(channelId, true);
        }
    }
}