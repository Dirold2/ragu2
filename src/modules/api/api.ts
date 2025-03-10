import { FastifyInstance } from 'fastify';
import { module } from './module.js';

export class Api {
    constructor(
        private readonly server: FastifyInstance,
        private readonly locale: typeof module.locale
    ) {}

    public setupRoutes(): void {
        // Server health
        this.server.get('/health', async (_request, reply) => {
            reply.send({ status: 'ok' });
        });

        this.server.get('/welcome', (_, reply) => {
            const message = this.locale.t('messages.welcome');
            reply.send({ message });
        });

        this.server.setErrorHandler((_error, _, reply) => {
            const errorMessage = this.locale.t('logger.errors.route');
            reply.status(500).send({ error: errorMessage });
        });
    }
}