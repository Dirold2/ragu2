import type {
	FastifyInstance,
	FastifyRequest,
	FastifyReply,
	RouteShorthandOptions,
	RouteGenericInterface,
} from "fastify";
import type { module } from "./module.js";
import type { ModuleManager } from "#core/ModuleManager.js";

// Define types for route parameters
interface GuildIdParams {
	guildId: string;
}

// Define a generic interface for request parameters
interface RequestGeneric extends RouteGenericInterface {
	Params: any;
	Body: any;
	Querystring: any;
}

// Define handler types for different HTTP methods
type RouteHandler<P = any, B = any, Q = any> = (
	request: FastifyRequest<{
		Params: P;
		Body: B;
		Querystring: Q;
	}>,
	reply: FastifyReply,
	context: RouteContext,
) => Promise<any> | any;

// Define middleware type
type RouteMiddleware = (
	request: FastifyRequest<RequestGeneric>,
	reply: FastifyReply,
) => Promise<void>;

// Context object passed to all handlers
interface RouteContext {
	locale: typeof module.locale;
	[key: string]: any;
}

// Route group for organizing related routes
class RouteGroup {
	private prefix: string;
	private api: Api;
	private middlewares: RouteMiddleware[];

	constructor(api: Api, prefix = "") {
		this.api = api;
		this.prefix = prefix;
		this.middlewares = [];
	}

	// Add middleware to this group
	use(middleware: RouteMiddleware): RouteGroup {
		this.middlewares.push(middleware);
		return this;
	}

	// Create a nested group
	group(prefix: string): RouteGroup {
		return new RouteGroup(this.api, `${this.prefix}${prefix}`);
	}

	// HTTP method handlers
	get<P = any, Q = any>(
		path: string,
		handler: RouteHandler<P, any, Q>,
		opts?: RouteShorthandOptions,
	): RouteGroup {
		this.api.registerRoute(
			"GET",
			`${this.prefix}${path}`,
			handler,
			this.middlewares,
			opts,
		);
		return this;
	}

	post<P = any, B = any, Q = any>(
		path: string,
		handler: RouteHandler<P, B, Q>,
		opts?: RouteShorthandOptions,
	): RouteGroup {
		this.api.registerRoute(
			"POST",
			`${this.prefix}${path}`,
			handler,
			this.middlewares,
			opts,
		);
		return this;
	}

	put<P = any, B = any, Q = any>(
		path: string,
		handler: RouteHandler<P, B, Q>,
		opts?: RouteShorthandOptions,
	): RouteGroup {
		this.api.registerRoute(
			"PUT",
			`${this.prefix}${path}`,
			handler,
			this.middlewares,
			opts,
		);
		return this;
	}

	delete<P = any, Q = any>(
		path: string,
		handler: RouteHandler<P, any, Q>,
		opts?: RouteShorthandOptions,
	): RouteGroup {
		this.api.registerRoute(
			"DELETE",
			`${this.prefix}${path}`,
			handler,
			this.middlewares,
			opts,
		);
		return this;
	}

	patch<P = any, B = any, Q = any>(
		path: string,
		handler: RouteHandler<P, B, Q>,
		opts?: RouteShorthandOptions,
	): RouteGroup {
		this.api.registerRoute(
			"PATCH",
			`${this.prefix}${path}`,
			handler,
			this.middlewares,
			opts,
		);
		return this;
	}
}

/**
 * Enhanced API class with route grouping and middleware support
 */
export class Api {
	private server: FastifyInstance;
	private locale: typeof module.locale;
	private moduleManager: ModuleManager;
	private context: RouteContext;

	constructor(
		server: FastifyInstance,
		locale: typeof module.locale,
		moduleManager: ModuleManager,
	) {
		this.server = server;
		this.locale = locale;
		this.moduleManager = moduleManager;
		this.context = { locale };
	}

	/**
	 * Sets up all API routes
	 */
	public setupRoutes(): void {
		// Get bot instance and add to context
		const bot = this.moduleManager
			.getModule<typeof import("../bot/module.js").module>("bot")!
			.exports.getBot();

		// Add bot to context
		this.context.bot = bot;

		// Register request logging middleware
		this.server.addHook("onRequest", (request, _reply, done) => {
			request.log.info(`Incoming request: ${request.method} ${request.url}`);
			done();
		});

		// Set up global error handler
		this.setupErrorHandler();

		// Create route groups using the fluent API

		// Server info routes
		this.group()
			.get("/health", async (_request, reply) => {
				return reply.send({ status: "ok" });
			})
			.get("/welcome", (_request, reply, { locale }) => {
				const message = locale.t("messages.welcome");
				return reply.send({ message });
			});

		// Player routes with parameter validation
		this.group("/:guildId/player")
			.use(this.validateGuildId)
			.get("", (request, reply, { bot }) => {
				const { guildId } = request.params as GuildIdParams;
				const player = bot.playerManager.getPlayer(guildId);

				if (!player) {
					return reply.status(404).send({
						error: "Player not found",
						guildId,
					});
				}

				const currentTrack = player.state.currentTrack?.info;

				if (!currentTrack) {
					return reply.send({ message: "No track" });
				}

				return reply.send({ message: currentTrack });
			})
			.get("/skip", async (request, reply, { bot }) => {
				const { guildId } = request.params as GuildIdParams;
				const player = bot.playerManager.getPlayer(guildId);

				if (!player) {
					return reply.status(404).send({
						error: "Player not found for this guild",
						guildId,
					});
				}

				await bot.playerManager.skip(guildId);

				return reply.send({
					message: "Track skipped successfully",
					success: true,
					guildId,
				});
			})
			.post(
				"/queue",
				async (request, reply, { bot }) => {
					const { guildId } = request.params as GuildIdParams;
					const { info, source, trackId } = request.body as {
						info: string;
						source: string;
						trackId: string;
					};

					const player = bot.playerManager.getPlayer(guildId);

					if (!player) {
						return reply.status(404).send({
							error: "Player not found",
							guildId,
						});
					}

					await bot.playerManager.playOrQueueTrack(guildId, {
						info,
						source,
						trackId,
					});

					return reply.status(201).send({
						message: "Track added to queue successfully",
						success: true,
						guildId,
					});
				},
				{
					schema: {
						body: {
							type: "object",
							required: ["info", "source", "trackId"],
							properties: {
								info: { type: "string" },
								source: { type: "string" },
								trackId: { type: "string" },
							},
						},
					},
				},
			);
	}

	/**
	 * Create a new route group
	 * @param prefix Optional prefix for all routes in this group
	 */
	public group(prefix = ""): RouteGroup {
		return new RouteGroup(this, prefix);
	}

	/**
	 * Register a route with the server
	 * @param method HTTP method
	 * @param path Route path
	 * @param handler Route handler
	 * @param middlewares Middlewares to apply
	 * @param opts Route options
	 */
	public registerRoute(
		method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
		path: string,
		handler: RouteHandler<any, any, any>,
		middlewares: RouteMiddleware[] = [],
		opts?: RouteShorthandOptions,
	): void {
		this.server.route({
			method,
			url: path,
			schema: opts?.schema,
			handler: async (request, reply) => {
				try {
					// Apply middlewares
					for (const middleware of middlewares) {
						// Cast request to the expected type for middleware
						await middleware(request as FastifyRequest<RequestGeneric>, reply);
						if (reply.sent) return;
					}

					// Call the handler with context
					return await handler(
						request as FastifyRequest<{
							Params: any;
							Body: any;
							Querystring: any;
						}>,
						reply,
						this.context,
					);
				} catch (error) {
					request.log.error(`Error in ${method} ${path}: ${error}`);
					return reply.status(500).send({
						error: "An error occurred while processing your request",
						path,
					});
				}
			},
		});
	}

	/**
	 * Middleware to validate guild ID
	 */
	private validateGuildId: RouteMiddleware = async (
		request,
		reply,
	): Promise<void> => {
		const { guildId } = request.params as GuildIdParams;

		if (!guildId || typeof guildId !== "string") {
			reply.status(400).send({
				error: "Invalid guild ID",
				details: "Guild ID must be a valid string",
			});
		}
	};

	/**
	 * Sets up global error handler
	 */
	private setupErrorHandler(): void {
		this.server.setErrorHandler((error, request, reply) => {
			request.log.error(`API Error: ${error}`);

			// Handle validation errors
			if (error.validation) {
				return reply.status(400).send({
					error: "Validation Error",
					details: error.validation,
				});
			}

			const errorMessage = this.locale.t("logger.errors.route");
			return reply.status(500).send({ error: errorMessage });
		});
	}
}
