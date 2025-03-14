import type { Client } from "discord.js";

// Типы импортов из других модулей
export interface BotExports {
	bot: () => Client;
}

// Типы для API модуля
export interface ApiRouteHandler {
	path: string;
	method: "get" | "post" | "put" | "delete";
	handler: (req: unknown, res: unknown) => void | Promise<void>;
}
