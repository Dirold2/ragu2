import type { Logger } from "dlog2";
import type { PlayerManager, CommandService, CacheQueueService, NameService } from "../services/index.js";

export interface CommandDeps {
  playerManager: PlayerManager;
  commandService: CommandService;
  queueService: CacheQueueService;
  nameService: NameService;
  logger: Logger;
  t: (key: string, params?: Record<string, unknown>, lang?: string | boolean) => string;
}

let currentDeps: CommandDeps | null = null;

export function setCommandDeps(deps: CommandDeps): void {
  currentDeps = deps;
}

export function getDeps(): CommandDeps {
  if (!currentDeps) {
    throw new Error("CommandDeps not initialized – call setCommandDeps() before importing commands");
  }
  return currentDeps;
}

/** Translation helper for decorators (evaluated early, returns key as fallback) */
export function t(key: string, params?: Record<string, unknown>, lang?: string | boolean): string {
  return currentDeps?.t(key, params, lang) ?? key;
}
