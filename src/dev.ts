import chokidar from "chokidar";
import { DIService, MetadataStorage } from "discordx";
import { resolve } from "@discordx/importer";
import { dirname } from "dirname-filename-esm";
import { bot } from "./bot.js";
import { setCommandDeps } from "./commands/commandDeps.js";
import { getErrorMessage } from "./utils/error.js";
import { config } from "@dotenvx/dotenvx";
import { resolve as r } from "path";

config({ path: r(dirname(import.meta), "../.env") });

const __dirname = dirname(import.meta);

const CONSTANTS = {
  RELOAD_DEBOUNCE: 500,
} as const;

const patterns = {
  commands: `${__dirname}/commands/**/*.ts`,
  events: `${__dirname}/events/**/*.ts`,
  services: `${__dirname}/services/**/*.ts`,
  plugins: `${__dirname}/plugins/**/*.ts`,
} as const;

const { logger, locale } = bot;
locale.load();

["SIGINT", "SIGTERM", "SIGUSR2"].forEach((signal) => {
  process.on(signal, () => {
    bot.destroy();
    process.exit(0);
  });
});

async function loadFiles(src: string): Promise<void> {
  try {
    if (src === patterns.commands) {
      MetadataStorage.clear();
    }

    const files = await resolve(src);
    await Promise.all(
      files.map((file) => import(file).catch((error) => bot.logger.error(getErrorMessage(error)))),
    );
  } catch (error) {
    bot.logger.error(getErrorMessage(error));
  }
}

async function reload(): Promise<void> {
  try {
    DIService.engine.clearAllServices();

    await Promise.all([
      loadFiles(patterns.commands),
      loadFiles(patterns.events),
      loadFiles(patterns.services),
      loadFiles(patterns.plugins),
    ]);

    bot.removeEvents();
    bot.initEvents();
  } catch (error) {
    bot.logger.error(getErrorMessage(error));
  }
}

async function run(): Promise<void> {
  try {
    await bot.initialize();

    setCommandDeps({
      playerManager: bot.playerManager,
      commandService: bot.commandService,
      queueService: bot.queueService,
      nameService: bot.nameService,
      logger: bot.logger,
      t: (key, params, lang) => bot.locale.t(key as any, params as any, lang),
    });

    logger.info(locale.t("messages.bot.initialization.success"));

    await Promise.all([
      loadFiles(patterns.commands),
      loadFiles(patterns.events),
      loadFiles(patterns.services),
      loadFiles(patterns.plugins),
    ]);

    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error(`token error`);
    }

    await bot.start(token);

    logger.info(locale.t("messages.bot.start.success"));

    if (process.env.NODE_ENV === "development") {
      const debouncedReload = () => {
        let timeoutId: NodeJS.Timeout;
        return () => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(reload, CONSTANTS.RELOAD_DEBOUNCE);
        };
      };

      const watcher = chokidar.watch(__dirname, {
        ignored: ["**/node_modules/**", "**/.git/**"],
        persistent: true,
        ignoreInitial: true,
      });

      watcher
        .on("add", debouncedReload())
        .on("change", debouncedReload())
        .on("unlink", debouncedReload());
    }
  } catch (error) {
    bot.logger.error(getErrorMessage(error));
    process.exit(1);
  }
}

run();
