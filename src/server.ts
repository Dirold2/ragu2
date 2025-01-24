import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import logger from "./utils/logger.js";
import { registerRoutes } from "./api/main.js";
import net from "net";
import { bot } from "./bot.js";

/**
 * Finds an available port
 * @param {number} startPort - The starting port number
 * @returns {Promise<number>} - The available port number
 */
async function findAvailablePort(startPort: number): Promise<number> {
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
		logger.warn(`${bot.loggerMessages.PORT_IN_USE}`);
		port++;
	}
	return port;
}

/**
 * Starts the Fastify server
 * @returns {Promise<FastifyInstance>} - Returns the Fastify instance
 */
export async function startServer(): Promise<FastifyInstance> {
	const server = Fastify({
		logger: false,
	});

	// Register cors middleware
	await server.register(cors, {
		origin: "*",
		methods: ["GET", "POST"],
	});

	// Register API routes
	await registerRoutes(server);

	// Set error handler
	server.setErrorHandler((error, _request, reply) => {
		logger.error(`${bot.loggerMessages.SERVER_ERROR}`, error);
		reply.status(500).send({ error: "Internal Server Error" });
	});

	try {
		const startPort = Number(process.env.API_PORT) || 1750;
		const availablePort = await findAvailablePort(startPort);

		await server.listen({
			port: availablePort,
			host: "0.0.0.0",
		});

		const address = server.server.address();
		const port =
			address && typeof address === "object" ? address.port : availablePort;
		logger.info(`${bot.loggerMessages.SERVER_RUNNING_ON_PORT(port)}`);
		logger.info(`http://127.0.0.1:${port}`);
	} catch (err) {
		logger.error(`${bot.loggerMessages.SERVER_START_ERROR}`, err);
		process.exit(1);
	}

	return server;
}
