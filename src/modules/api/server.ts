import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import net from "net";

import { module } from './module.js';

export class ApiServer {
	private server: FastifyInstance | null = null;

	/**
	 * Finds an available port
	 * @param startPort - Starting port to search from
	 */
	private async findAvailablePort(startPort: number): Promise<number> {
		const isPortAvailable = (port: number): Promise<boolean> => {
			return new Promise((resolve) => {
				const server = net
					.createServer()
					.once("error", () => resolve(false))
					.once("listening", () => {
						server.close();
						resolve(true);
					});
				server.listen(port, "0.0.0.0");
			});
		};

		let port = startPort;
		while (!(await isPortAvailable(port))) {
			module.logger.warn(`Port ${port} is in use`);
			port++;
		}
		return port;
	}

	public async create(): Promise<FastifyInstance> {
		this.server = Fastify({
			logger: false,
		});

		// Register cors middleware
		await this.server.register(cors, {
			origin: "*",
			methods: ["GET", "POST"],
		});
		module.logger.debug('CORS enabled');

		// Set error handler
		this.server.setErrorHandler((error, _request, reply) => {
			module.logger.error('Route error', { error: error.message });
			reply.status(500).send({ error: 'Internal server error'});
		});

		return this.server;
	}

	public async start(): Promise<FastifyInstance> {
		if (!this.server) {
			throw new Error('Server must be created before starting');
		}

		try {
			// Start the server
			const startPort = Number(process.env.API_PORT) || 1750;
			const availablePort = await this.findAvailablePort(startPort);

			await this.server.listen({
				port: availablePort,
				host: "0.0.0.0",
			});

			return this.server;
		} catch (error) {
			module.logger.error(module.locale.t('logger.errors.serverStart', {error: error instanceof Error ? error.message : String(error)}));
			throw error;
		}
	}

	public async stop(): Promise<void> {
		if (this.server) {
			try {
				await this.server.close();
				this.server = null;
			} catch (error) {
				module.logger.error(module.locale.t('logger.errors.serverStop', {error: error instanceof Error ? error.message : String(error)}));
				throw error;
			}
		}
	}

	public getServer(): FastifyInstance | null {
		return this.server;
	}
}
