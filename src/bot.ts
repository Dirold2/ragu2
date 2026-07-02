import {
  type ClientEvents,
  IntentsBitField,
  type Interaction,
  type Message,
} from "discord.js";
import { Client } from "discordx";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import {
  CacheQueueService,
  CommandService,
  NameService,
  PlayerManager,
  PluginManager,
} from "./services/index.js";

import { dirname } from "dirname-filename-esm";
import { MusicServicePlugin } from "./interfaces/index.js";
import { getErrorMessage } from "./utils/error.js";
import translations from "./locales/en.json" with { type: "json" };
import createLogger from "dlog2";
import { createLocale } from "./utils/locale.js";

export class Bot {
  public readonly client: Client;
  public nameService!: NameService;
  public queueService!: CacheQueueService;
  public playerManager!: PlayerManager;
  public commandService!: CommandService;
  public pluginManager!: PluginManager;
  public logger = createLogger(`ragu2`);
  public locale = createLocale<typeof translations>(`ragu2`);
  private eventHandlers: Map<string, (...args: any[]) => void> = new Map();

  constructor() {
    this.client = new Client({
      intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildMessageReactions,
        IntentsBitField.Flags.GuildVoiceStates,
        IntentsBitField.Flags.MessageContent,
      ],
      silent: true,
      simpleCommand: { prefix: "!" },
    });
  }

  public async initialize(): Promise<void> {
    try {
      await this.locale.load();
      this.setupEvents();
      await this.initServices();
    } catch (error) {
      this.logger.error(
        `${this.locale.t("messages.bot.status.init_failed")}: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private async initServices(): Promise<void> {
    try {
      this.commandService = new CommandService(this.locale);
      this.pluginManager = new PluginManager(this.logger, this.locale);
      await this.loadPlugins();

      this.queueService = new CacheQueueService(this.logger, this.locale);

      this.playerManager = new PlayerManager(
        this.queueService,
        this.commandService,
        this.client,
        this.pluginManager,
        (
          key: string,
          params?: Record<string, unknown>,
          lang?: string | boolean,
        ) =>
          (
            this.locale.t as (
              key: string,
              params?: Record<string, unknown>,
              lang?: string | boolean,
            ) => string
          )(key, params, lang),
        this.logger,
      );

      this.nameService = new NameService(
        this.queueService,
        this.playerManager,
        this.pluginManager,
        this.commandService,
        this.logger,
        (
          key: string,
          params?: Record<string, unknown>,
          lang?: string | boolean,
        ) =>
          (
            this.locale.t as (
              key: string,
              params?: Record<string, unknown>,
              lang?: string | boolean,
            ) => string
          )(key, params, lang),
      );
    } catch (error) {
      this.logger.error(
        `${this.locale.t("messages.bot.initialization.failed")}: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private isMusicServicePlugin(obj: any): obj is MusicServicePlugin {
    return (
      obj &&
      typeof obj.name === "string" &&
      Array.isArray(obj.urlPatterns) &&
      typeof obj.searchName === "function" &&
      typeof obj.getTrackUrl === "function"
    );
  }

  private async loadPlugins(): Promise<void> {
    const pluginsDir = path.resolve(dirname(import.meta), "plugins");

    try {
      const files = await fs.promises.readdir(pluginsDir);
      const pluginFiles = files.filter(
        (file) => file.endsWith(".ts") || file.endsWith(".js"),
      );

      await Promise.all(
        pluginFiles.map(async (file) => {
          const pluginPath = String(pathToFileURL(path.join(pluginsDir, file)));
          try {
            const imported = await import(pluginPath);
            const PluginConstructor = imported?.default;

            if (typeof PluginConstructor !== "function") {
              this.logger.warn(
                this.locale.t("messages.bot.warnings.invalid_plugin_export", {
                  file,
                }),
                { file },
              );
              return;
            }

            const pluginInstance = new PluginConstructor();

            if (!this.isMusicServicePlugin(pluginInstance)) {
              this.logger.warn(
                this.locale.t("messages.bot.warnings.plugin_shape_mismatch", {
                  file,
                }),
                { file, plugin: pluginInstance },
              );
              return;
            }

            const registered =
              this.pluginManager.registerPlugin(pluginInstance);
            if (registered) {
              this.logger.info(
                this.locale.t(
                  pluginInstance.disabled
                    ? "messages.bot.info.plugin_loaded_disabled"
                    : "messages.bot.info.plugin_loaded",
                  { file, name: pluginInstance.name },
                ),
                { plugin: pluginInstance.name },
              );
            }
          } catch (error) {
            this.logger.error(
              `${this.locale.t("messages.bot.errors.register_error_files", {
                file,
              })}: ${getErrorMessage(error)}`,
            );
          }
        }),
      );

      await this.pluginManager.initializePlugins();
    } catch (error) {
      this.logger.error(
        `${this.locale.t("messages.bot.errors.register_error")}: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private setupEvents(): void {
    const readyHandler = async () => {
      try {
        await this.client.initApplicationCommands();
      } catch (error) {
        this.logger.error(
          `${this.locale.t("messages.bot.status.init_failed")}: ${getErrorMessage(error)}`,
        );
      }
    };

    const interactionHandler = (interaction: Interaction) => {
      void this.client.executeInteraction(interaction);
    };

    const messageHandler = (message: Message<boolean>) => {
      void this.client.executeCommand(message);
    };

    this.eventHandlers.set("clientReady", readyHandler);
    this.eventHandlers.set("interactionCreate", interactionHandler);
    this.eventHandlers.set("messageCreate", messageHandler);

    this.client.once("clientReady", readyHandler);
    this.client.on("interactionCreate", interactionHandler);
    this.client.on("messageCreate", messageHandler);

    this.logger.debug("Discord client events are set");
  }

  public async start(token: string): Promise<void> {
    try {
      await this.client.login(token);
    } catch (error) {
      this.logger.error(
        this.locale.t("messages.bot.status.start_error", {
          error: String(error),
        }),
      );
      throw error;
    }
  }

  public removeEvents(): void {
    for (const [event, handler] of this.eventHandlers) {
      this.client.off(event as keyof ClientEvents, handler);
    }
    this.eventHandlers.clear();
  }

  public initEvents(): void {
    this.setupEvents();
  }

  public async destroy(): Promise<void> {
    await this.playerManager.destroyAll();
    this.removeEvents();
    await this.client.destroy();
  }
}

export const bot = new Bot();
export const createBot = () => new Bot();
