import { FastifyInstance } from 'fastify';
import { bot } from '../bot.js';
import { Track } from '../interfaces/index.js';
import logger from '../utils/logger.js';

interface QueueParams {
    guildId: string;
    channelId: string;
}

interface QueueBody {
    action: 'add' | 'clear';
    track?: Track;
}

interface VolumeBody {
    volume: number;
}

interface LoopBody {
    enabled: boolean;
}

export async function registerRoutes(server: FastifyInstance) {

    // Получить текущую очередь
    server.get<{ Params: QueueParams }>(
        '/queue/:guildId/:channelId',
        async (request) => {
            const { channelId } = request.params;
            return await bot.queueService.getQueue(channelId);
        }
    );

    server.get<{ Params: QueueParams }>(
        '/top',
        async () => {
            const tracks = await bot.queueService.getTopPlayedTracks(100);
            
            // Преобразуем BigInt в строку перед отправкой
            const serializedTracks = tracks.map(track => ({
                ...track,
                addedAt: track.addedAt ? track.addedAt.toString() : undefined
            }));
            
            return serializedTracks;
        }
    );

    // Управление очередью
    server.post<{ Params: QueueParams; Body: QueueBody }>(
        '/queue/:guildId/:channelId',
        async (request, reply) => {
            const { guildId, channelId } = request.params;
            const { action, track } = request.body;

            try {
                if (action === 'add' && track) {
                    await bot.queueService.setTrack(channelId, guildId, track);
                    return { success: true, message: "Track added to queue" };
                } else if (action === 'clear') {
                    await bot.queueService.clearQueue(channelId);
                    return { success: true, message: "Queue cleared" };
                }
                return { success: false, message: "Invalid action" };
            } catch (error) {
                logger.error(`Queue error: ${error instanceof Error ? error.message : String(error)}`);
                return reply.status(500).send({ 
                    success: false, 
                    message: "Failed to manage queue" 
                });
            }
        }
    );

    // Установить громкость
    server.post<{ Params: { guildId: string }; Body: VolumeBody }>(
        '/player/volume/:guildId',
        async (request, reply) => {
            const { guildId } = request.params;
            const { volume } = request.body;

            try {
                await bot.playerManager.setVolume(guildId, volume);
                return { success: true, message: `Volume set to ${volume}` };
            } catch (error) {
                logger.error(`Volume error: ${error instanceof Error ? error.message : String(error)}`);
                return reply.status(500).send({ 
                    success: false, 
                    message: "Failed to set volume" 
                });
            }
        }
    );

    // Управление циклом
    server.post<{ Params: { guildId: string }; Body: LoopBody }>(
        '/player/loop/:guildId',
        async (request, reply) => {
            const { guildId } = request.params;
            const { enabled } = request.body;

            try {
                await bot.queueService.setLoop(guildId, enabled);
                return { 
                    success: true, 
                    message: `Loop ${enabled ? 'enabled' : 'disabled'}` 
                };
            } catch (error) {
                logger.error(`Loop error: ${error instanceof Error ? error.message : String(error)}`);
                return reply.status(500).send({ 
                    success: false, 
                    message: "Failed to set loop" 
                });
            }
        }
    );
}