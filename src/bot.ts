import { Client } from "discordx";
import { IntentsBitField, Interaction, Message } from "discord.js";
import { NameService, QueueService, PlayerService, CommandService, YandexService, YouTubeService } from "./services/index.js";
import logger from "./utils/logger.js";

class Bot {
    public client: Client;
    public nameService: NameService;
    public queueService: QueueService;
    public playerService: PlayerService;
    public commandService: CommandService;

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
            silent: false,
            simpleCommand: {
                prefix: "!",
            },
        });

        this.initializeServices();
        this.setupEventListeners();
    }

    private initializeServices(): void {
        this.commandService = new CommandService();
        this.queueService = new QueueService();
        this.playerService = new PlayerService(this.queueService, this.commandService);
        const yandexService = new YandexService();
        const youtubeService = new YouTubeService();
        this.nameService = new NameService(yandexService, youtubeService, this.queueService, this.playerService);
    }

    private setupEventListeners(): void {
        this.client.once("ready", () => {
            void this.client.initApplicationCommands();
            logger.info("Bot started");
        });

        this.client.on("interactionCreate", (interaction: Interaction) => {
            this.client.executeInteraction(interaction);
        });

        this.client.on("messageCreate", (message: Message) => {
            void this.client.executeCommand(message);
        });
    }

    public async start(token: string): Promise<void> {
        try {
            await this.client.login(token);
        } catch (error) {
            logger.error("Failed to start the bot:", error);
        }
    }

    public removeEvents(): void {
        this.client.removeAllListeners();
    }

    public initEvents(): void {
        this.setupEventListeners();
    }
}

export const bot = new Bot();