import Fastify from 'fastify';
import cors from '@fastify/cors';
import logger from './utils/logger.js';
import { registerRoutes } from './api/main.js';
import net from 'net';

async function findAvailablePort(startPort: number): Promise<number> {
    const isPortAvailable = (port: number): Promise<boolean> => {
        return new Promise((resolve) => {
            const server = net.createServer()
                .once('error', () => resolve(false))
                .once('listening', () => {
                    server.close();
                    resolve(true);
                });
            server.listen(port, '0.0.0.0');
        });
    };

    let port = startPort;
    while (!(await isPortAvailable(port))) {
        logger.info(`Port ${port} is in use, trying next port`);
        port++;
    }
    return port;
}

export async function startServer() {
    const server = Fastify({
        logger: false
    });

    await server.register(cors, {
        origin: '*',
        methods: ['GET', 'POST']
    });

    // Регистрируем API роуты
    await registerRoutes(server);

    // Обработка ошибок
    server.setErrorHandler((error, _request, reply) => {
        logger.error('Server error:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
    });

    try {
        const startPort = Number(process.env.API_PORT) || 3000;
        const availablePort = await findAvailablePort(startPort);
        
        await server.listen({
            port: availablePort,
            host: '0.0.0.0'
        });
        
        const address = server.server.address();
        const port = address && typeof address === 'object' ? address.port : availablePort;
        logger.info(`Server running on port ${port}`);
    } catch (err) {
        logger.error('Failed to start server:', err);
        process.exit(1);
    }

    return server;
}
